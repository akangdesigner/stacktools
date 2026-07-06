"use client";

import { useState } from "react";

// 單頁 TKD 結果（對應後端 PageTkd）
interface PageTkd {
  url: string;
  label?: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  error?: string;
}

// 後端 /api/tkd 的成功回傳
interface TkdResult {
  ok: boolean;
  tabName: string;
  pageCount: number;
  wroteCount: number;
  suggested?: number;
  matched: Record<string, boolean>;
  pages: PageTkd[];
}

// 第①步 /api/tkd/collect 回傳的候選頁（AI 已判型態與建議勾選）
interface CandidatePage {
  url: string;
  label?: string;
  type: string;
  include: boolean;
}

// 網址顯示用：還原中文 slug，失敗就原樣
function pretty(u: string): string {
  try {
    return decodeURI(u);
  } catch {
    return u;
  }
}

// 網址路徑段（麵包屑）：去語系前綴後的路徑分段，首頁=[]、/about=["about"]、/works/detail/x=["works","detail","x"]。
// 先去掉語系前綴（/zh-hant、/en 等），與 lib/tkd-crawler 的去重規則一致，避免多語系站把 /zh-hant/about 誤判成兩層
function pathSegs(u: string): string[] {
  try {
    const p = new URL(u).pathname
      .replace(/^\/(zh-hant|zh-tw|zh-cn|en(-us)?|ja|default)(?=\/|$)/i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    return p ? p.split("/").filter(Boolean) : [];
  } catch {
    return [];
  }
}

// 該站「主要層」：最淺、且該層頁數 ≥3 的那層（穩健版）。
// 只取最小層會被單一淺層索引頁拉低（如 Shopline 的 /products 全商品頁 → 把層數壓成 1）；
// 改成「最淺、且有一定數量的層」才穩。沒有任一層達 3 頁就退回最小層。
function mainDepthOf(pages: { url: string }[]): number {
  const cnt: Record<number, number> = {};
  for (const p of pages) {
    const d = pathSegs(p.url).length;
    if (d >= 1) cnt[d] = (cnt[d] ?? 0) + 1;
  }
  const depths = Object.keys(cnt)
    .map(Number)
    .sort((a, b) => a - b);
  for (const d of depths) if (cnt[d] >= 3) return d;
  return depths[0] ?? 1;
}

// 收錄頁的「路徑 key 集合」，用來判斷某頁的上層是否也被收錄
function pathKeySet(pages: { url: string }[]): Set<string> {
  return new Set(pages.map((p) => "/" + pathSegs(p.url).join("/")).filter((k) => k !== "/"));
}

// 是否主要目標頁（純用麵包屑判斷）：
// 1) 首頁一定是；
// 2) 若「有任一上層路徑也被收錄」→ 子頁（如 /products/xxx 的上層 /products 有被收，代表它是商品明細）；
// 3) 若比該站主要層更深 → 子頁（接住沒有明確上層頁的文章列表，如 /blog/detail/xxx）；
// 其餘＝主要目標頁（如 /categories/內衣 沒有 /categories 這個上層頁，就是主分頁）
function isMainPage(url: string, mainDepth: number, keySet: Set<string>): boolean {
  const segs = pathSegs(url);
  if (segs.length === 0) return true; // 首頁
  for (let i = 1; i < segs.length; i++) {
    if (keySet.has("/" + segs.slice(0, i).join("/"))) return false; // 上層頁有被收 → 子頁
  }
  return segs.length <= mainDepth;
}

// 背景任務進度（對應 lib/tkd-jobs.ts 的 TkdJob）
interface TkdJob {
  status: "running" | "completed" | "failed";
  message: string;
  done: number;
  total: number;
  result?: unknown; // 完成後的結果（蒐集與產生兩種任務的形狀不同，由呼叫端斷言）
  error?: string;
}

// 安全解析回應：伺服器逾時會回「Bad Gateway」純文字，直接 res.json() 會炸出看不懂的錯
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`伺服器回應異常（HTTP ${res.status}）：${text.slice(0, 100)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 啟動背景任務後每 3 秒輪詢進度直到完成，回傳任務結果；失敗就丟錯
// （兩步的 API 都改成「POST 回 jobId → GET ?id= 查進度」，避免長請求被 Zeabur 閘道切斷回 502）
async function pollJob<T>(endpoint: string, jobId: string, onProgress: (msg: string) => void): Promise<T> {
  for (;;) {
    await sleep(3000);
    const res = await fetch(`${endpoint}?id=${encodeURIComponent(jobId)}`);
    const job = (await safeJson(res)) as unknown as TkdJob & { error?: string };
    if (!res.ok) throw new Error(String(job.error || "查詢任務進度失敗"));
    if (job.status === "failed") throw new Error(job.error || "任務失敗");
    if (job.status === "completed") return job.result as T;
    onProgress(job.message || "處理中…");
  }
}

export default function TkdPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [scope, setScope] = useState<"important" | "all">("important");
  const [collecting, setCollecting] = useState(false); // 第①步蒐集中
  const [generating, setGenerating] = useState(false); // 第②步爬取＋寫入中
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<CandidatePage[] | null>(null);
  const [extraKeywords, setExtraKeywords] = useState(""); // 指定關鍵字（逗號分隔，全站共用）
  const [collectProgress, setCollectProgress] = useState(""); // 第①步背景任務的進度訊息
  const [progress, setProgress] = useState(""); // 第②步背景任務的進度訊息
  const [result, setResult] = useState<TkdResult | null>(null);

  // 第①步：蒐集候選頁＋AI 分類，列出勾選清單
  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    setCollecting(true);
    setError("");
    setCandidates(null);
    setResult(null);
    setCollectProgress("任務啟動中…");
    try {
      const res = await fetch("/api/tkd/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, limit, scope }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(String(data.error || "發生錯誤"));
      const jobId = String(data.jobId || "");
      if (!jobId) throw new Error("伺服器沒有回傳任務 id");
      const collected = await pollJob<{ pages: CandidatePage[] }>(
        "/api/tkd/collect",
        jobId,
        setCollectProgress,
      );
      // 小積木拍板的預設勾選規則：用「麵包屑」判主/子頁，預設只勾「主要目標頁」，子頁不勾。
      // 主/子判斷會看「上層頁是否也被收錄」（/products/xxx 的上層 /products 有收 → 子頁），
      // 所以 Shopline 這種分類頁與商品頁同層的站也分得開；再排除 AI 判為促銷/功能頁的（收錄意義低）。
      const mainDepth = mainDepthOf(collected.pages);
      const keySet = pathKeySet(collected.pages);
      setCandidates(
        collected.pages.map((p) => ({
          ...p,
          include:
            isMainPage(p.url, mainDepth, keySet) && p.type !== "促銷" && p.type !== "功能頁",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCollecting(false);
      setCollectProgress("");
    }
  }

  // 第②步：把勾選的頁面送去爬 TKD＋AI 建議＋寫回登記表
  async function handleGenerate() {
    if (!candidates) return;
    const selected = candidates.filter((p) => p.include);
    if (selected.length === 0) {
      setError("至少要勾選一頁");
      return;
    }
    setGenerating(true);
    setError("");
    setResult(null);
    setProgress("任務啟動中…");
    try {
      // 啟動背景任務（伺服器立刻回 jobId，避免長時間請求被 Zeabur 閘道切斷回 502）
      const res = await fetch("/api/tkd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl,
          sheetUrl,
          pages: selected.map((p) => ({ url: p.url, label: p.label })),
          extraKeywords,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(String(data.error || "發生錯誤"));
      const jobId = String(data.jobId || "");
      if (!jobId) throw new Error("伺服器沒有回傳任務 id");
      setResult(await pollJob<TkdResult>("/api/tkd", jobId, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  // 切換單頁勾選
  function toggleOne(url: string) {
    setCandidates((prev) =>
      prev ? prev.map((p) => (p.url === url ? { ...p, include: !p.include } : p)) : prev,
    );
  }

  // 切換整組勾選（全選/全不選）：用網址清單指定，不再綁型態
  function toggleGroup(urls: string[], include: boolean) {
    const set = new Set(urls);
    setCandidates((prev) =>
      prev ? prev.map((p) => (set.has(p.url) ? { ...p, include } : p)) : prev,
    );
  }

  // 以麵包屑分兩組：主要目標頁／子頁（判斷同 handleCollect：看上層是否被收錄＋層數）。
  // AI 判的型態（形象/產品/分類…）降為每頁旁的小標籤，不再拿來分大組
  const mainDepth = candidates ? mainDepthOf(candidates) : 1;
  const keySet = candidates ? pathKeySet(candidates) : new Set<string>();
  const groups = candidates
    ? [
        {
          key: "主要目標頁",
          pages: candidates.filter((p) => isMainPage(p.url, mainDepth, keySet)),
        },
        {
          key: "子頁",
          pages: candidates.filter((p) => !isMainPage(p.url, mainDepth, keySet)),
        },
      ].filter((g) => g.pages.length > 0)
    : [];
  const selectedCount = candidates ? candidates.filter((p) => p.include).length : 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* 頁首 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">TKD 現況產生器</h1>
        <p className="text-sm text-gray-500 mt-1">
          輸入客戶網址 → AI 蒐集並判斷要收錄的頁面 → 勾選確認 → 爬每頁現有 TKD、AI 生成建議 → 一次寫回登記表
        </p>
      </div>

      {/* 表單（第①步） */}
      <form onSubmit={handleCollect} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              客戶網址 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="例：https://stack.com.tw/"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              會合併主選單與 sitemap（含 robots.txt 宣告位置）蒐集頁面，AI 判斷型態後列出讓你勾選
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              登記表網址 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="貼上 Google 試算表網址（含 #gid= 分頁）"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              使用 GSC 同一組 Google 授權寫入；請確認該表已與此帳號共用可編輯
            </p>
          </div>

          <div className="flex gap-6 items-start">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">抓取範圍</label>
              <div className="flex gap-4 text-sm text-gray-700 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "important"}
                    onChange={() => setScope("important")}
                  />
                  重點頁（AI 判斷：首頁／形象頁／分類／產品／部落格總覽）
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                  />
                  全站
                </label>
              </div>
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-600 mb-1">頁數上限</label>
              <input
                type="number"
                min={1}
                max={300}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={collecting || generating}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {collecting ? collectProgress || "蒐集頁面＋AI 判斷中…" : "① 蒐集頁面"}
          </button>
        </div>
      </form>

      {/* 錯誤訊息 */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* 第①步結果：候選頁勾選清單 */}
      {candidates && !result && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">
                ② 確認要收錄的頁面（已勾 {selectedCount}／共 {candidates.length} 頁）
              </h2>
              <p className="text-xs text-gray-400">
                預設勾「主要目標頁」（網址層數最少的那層），子頁請自行勾選；點網址可開新分頁確認
              </p>
            </div>

            {groups.map((g) => {
              const checkedCount = g.pages.filter((p) => p.include).length;
              const groupUrls = g.pages.map((p) => p.url);
              return (
                <div key={g.key} className="border border-gray-100 rounded-lg">
                  <div className="flex items-center justify-between bg-gray-50 rounded-t-lg px-3 py-2">
                    <span className="text-xs font-bold text-gray-700">
                      {g.key}（{checkedCount}／{g.pages.length}）
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupUrls, true)}
                        className="text-orange-500 hover:text-orange-600"
                      >
                        全選
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupUrls, false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        全不選
                      </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                    {g.pages.map((p) => (
                      <li key={p.url}>
                        <label className="flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-orange-50">
                          <input
                            type="checkbox"
                            checked={p.include}
                            onChange={() => toggleOne(p.url)}
                            className="mt-0.5"
                          />
                          <span className="text-xs text-gray-700 min-w-0">
                            {p.label && <span className="font-medium">{p.label} </span>}
                            {/* AI 判的型態降為小標籤，只做輔助辨識，不影響分組/勾選 */}
                            <span className="inline-block text-[10px] text-gray-400 border border-gray-200 rounded px-1 mr-1 align-middle">
                              {p.type}
                            </span>
                            {/* 點網址開新分頁確認內容；stopPropagation 避免點連結時順便切到勾選 */}
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-400 break-all hover:text-orange-500 hover:underline"
                            >
                              {pretty(p.url)}
                            </a>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {/* 指定關鍵字：送出前讓使用者確認是否要指定必含的關鍵字 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                指定關鍵字（選填，逗號分隔）
              </label>
              <input
                type="text"
                value={extraKeywords}
                onChange={(e) => setExtraKeywords(e.target.value)}
                placeholder="例：台中網頁設計, SEO 優化, RWD 網站"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <p className="text-xs text-gray-400 mt-1">
                可以一次給很多個，AI 會逐頁判斷相關性，只把跟該頁相關的詞納入建議 TKD，不會全部硬塞
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || selectedCount === 0}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
            >
              {generating
                ? progress || "處理中…"
                : `③ 開始產生 TKD 並寫入登記表（${selectedCount} 頁）`}
            </button>
          </div>
        </div>
      )}

      {/* 第②步結果 */}
      {result && (
        <div className="mt-6 space-y-4">
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            已寫入分頁「{result.tabName}」，共 {result.wroteCount} 列（掃描 {result.pageCount} 頁）
            {result.suggested ? `，其中 ${result.suggested} 頁已生成建議 TKD` : ""}。
            {Object.entries(result.matched)
              .filter(([, ok]) => !ok)
              .map(([k]) => k).length > 0 && (
              <span className="block text-amber-600 mt-1">
                未對應到的欄位：
                {Object.entries(result.matched)
                  .filter(([, ok]) => !ok)
                  .map(([k]) => k)
                  .join("、")}
                （這些欄位留空未寫入，請確認表頭）
              </span>
            )}
          </div>

          {/* 逐頁結果表格 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">頁面</th>
                  <th className="text-left px-3 py-2 font-medium">現有 title</th>
                  <th className="text-left px-3 py-2 font-medium">現有 description</th>
                  <th className="text-left px-3 py-2 font-medium">現有 keywords</th>
                  <th className="text-left px-3 py-2 font-medium">現有 H1</th>
                </tr>
              </thead>
              <tbody>
                {result.pages.map((p, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 max-w-[240px] text-gray-700">
                      {p.label && <span className="font-medium">{p.label}</span>}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-all text-gray-400 hover:text-orange-500"
                      >
                        {p.url}
                      </a>
                      {p.error && <span className="block text-red-400">抓取失敗：{p.error}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{p.title}</td>
                    <td className="px-3 py-2 text-gray-600">{p.description}</td>
                    <td className="px-3 py-2 text-gray-600">{p.keywords}</td>
                    <td className="px-3 py-2 text-gray-600">{p.h1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
