"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 單頁 TKD 結果（對應後端 PageTkd）
interface PageTkd {
  url: string;
  label?: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  error?: string;
  suggest?: { title: string; description: string; keywords: string; h1: string }; // 這次生成的建議值
}

// 後端 /api/tkd 的成功回傳
interface TkdResult {
  ok: boolean;
  stage?: "existing" | "suggest";
  previewOnly?: boolean; // 只預覽模式（sheet 留空）：只生成、未寫回登記表
  draftId?: number; // 階段一寫完現有 TKD 後回傳的草稿 id
  tabName: string;
  pageCount: number;
  wroteCount: number;
  suggested?: number;
  matched: Record<string, boolean>;
  pages: PageTkd[];
}

// 草稿清單項（對應 /api/tkd/drafts）
interface DraftItem {
  id: number;
  name: string;
  siteUrl: string;
  sheetUrl: string;
  scope: "important" | "all";
  pageCount: number;
  pinned?: boolean; // 常駐草稿：測完不自動刪
  createdAt: string;
  updatedAt: string;
}

// 第①步 /api/tkd/collect 回傳的候選頁（AI 已判型態與建議勾選）
interface CandidatePage {
  url: string;
  label?: string;
  type: string;
  include: boolean;
}

// 偵測到的網站平台（後端 lib/tkd-platform 判定，這裡只做顯示；不 import 後端模組避免把 node 依賴打進前端）
type Platform = "91app" | "shopline" | "wordpress" | "generic";
const PLATFORM_BADGE: Record<Platform, { label: string; cls: string }> = {
  "91app": { label: "91APP", cls: "bg-blue-50 text-blue-600 border-blue-200" },
  shopline: { label: "SHOPLINE", cls: "bg-green-50 text-green-600 border-green-200" },
  wordpress: { label: "WordPress", cls: "bg-sky-50 text-sky-600 border-sky-200" },
  generic: { label: "自架", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

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

// 批量勾選的分組維度
export type PageGroup = { key: string; tag?: string; pages: CandidatePage[] };

// 某頁的「網址目錄」key：去掉最後一段當目錄（/SalePage/Index/123 → /salepage/index）；
// 首頁回特殊值、只有一段的頁（/about）自己當目錄
function dirKeyOf(url: string): string {
  const segs = pathSegs(url);
  if (segs.length === 0) return "__home__";
  if (segs.length === 1) return "/" + segs[0];
  return "/" + segs.slice(0, -1).join("/");
}

// 一組頁面裡數量最多的型態（當目錄組的輔助標籤）
function majorType(pages: CandidatePage[]): string {
  const cnt: Record<string, number> = {};
  for (const p of pages) cnt[p.type] = (cnt[p.type] ?? 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// 智慧分組：優先「依網址目錄」——能分出 ≥2 個多頁目錄組才用（91APP 這種分層網址會命中）；
// 分不出來（中文 slug 站全擠根目錄）就退回「依型態」分組。兩種站都好用、使用者零操作。
function buildGroups(cands: CandidatePage[]): PageGroup[] {
  // 先試依目錄分組
  const byDir = new Map<string, CandidatePage[]>();
  for (const p of cands) {
    const k = dirKeyOf(p.url);
    if (!byDir.has(k)) byDir.set(k, []);
    byDir.get(k)!.push(p);
  }
  const multiDirCount = [...byDir.values()].filter((a) => a.length >= 2).length;

  if (multiDirCount >= 2) {
    const groups: PageGroup[] = [];
    const others: CandidatePage[] = [];
    for (const [k, pages] of byDir) {
      if (k === "__home__") groups.push({ key: "首頁", pages });
      else if (pages.length >= 2) groups.push({ key: k, tag: majorType(pages), pages });
      else others.push(...pages); // 只有 1 頁的目錄併「其他」，避免一堆單頁小組
    }
    // 首頁排最前，其餘依頁數多寡，「其他」墊底
    groups.sort((a, b) =>
      a.key === "首頁" ? -1 : b.key === "首頁" ? 1 : b.pages.length - a.pages.length,
    );
    if (others.length) groups.push({ key: "其他", pages: others });
    return groups;
  }

  // 退回依型態分組（順序同 PAGE_TYPES）
  const TYPE_ORDER = ["首頁", "形象頁", "分類頁", "產品頁", "部落格", "促銷", "功能頁", "其他"];
  const byType = new Map<string, CandidatePage[]>();
  for (const p of cands) {
    const t = p.type || "其他";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(p);
  }
  return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ key: t, pages: byType.get(t)! }));
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
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [scope, setScope] = useState<"important" | "all">("important");
  const [collecting, setCollecting] = useState(false); // 第①步蒐集中
  const [generating, setGenerating] = useState(false); // 第②步爬取＋寫入中
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<CandidatePage[] | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null); // 偵測到的網站平台（顯示徽章用）
  const [extraKeywords, setExtraKeywords] = useState(""); // 指定關鍵字（逗號分隔，全站共用）
  const [notes, setNotes] = useState(""); // 微調：修正指示（自由文字）
  const [collectProgress, setCollectProgress] = useState(""); // 第①步背景任務的進度訊息
  const [progress, setProgress] = useState(""); // 第②步背景任務的進度訊息
  const [result, setResult] = useState<TkdResult | null>(null);
  // 兩階段：階段一（寫現有 TKD）完成後 stage1Done=true，露出關鍵字＋階段二按鈕
  const [stage1Done, setStage1Done] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null); // 目前這批對應的草稿 id
  const [currentPinned, setCurrentPinned] = useState(false); // 目前這批草稿是否常駐（常駐＝生成後不自動刪）
  const [draftSaved, setDraftSaved] = useState(false); // 這批是否已按「儲存草稿」存過
  const [drafts, setDrafts] = useState<DraftItem[]>([]); // 「我的草稿」清單

  // 第①步：蒐集候選頁＋AI 分類，列出勾選清單
  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    setCollecting(true);
    setError("");
    setCandidates(null);
    setPlatform(null);
    setResult(null);
    setStage1Done(false); // 重新蒐集＝重來一批，回到階段一
    setDraftId(null);
    setDraftSaved(false);
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
      const collected = await pollJob<{ pages: CandidatePage[]; platform?: Platform }>(
        "/api/tkd/collect",
        jobId,
        setCollectProgress,
      );
      const plat = collected.platform ?? "generic";
      setPlatform(plat);
      // 預設勾選：直接沿用後端的 include 判斷（AI 分類＋規則強制：分類/產品/首頁/形象=勾，
      // 部落格單篇/促銷/功能頁=不勾）。曾經試過用網址階層猜「主要頁」，但深淺層數在不同站
      // 結構下不穩（GSC/sitemap 補回的重要頁常常沒有選單名，卻剛好落在比雜項頁更深的層，
      // 依階層猜反而會被排除）——AI 分類是依語意判斷，不受網址結構影響，比較可靠。
      setCandidates(collected.pages.map((p) => ({ ...p })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCollecting(false);
      setCollectProgress("");
    }
  }

  // 讀「我的草稿」清單
  async function loadDrafts() {
    try {
      const res = await fetch("/api/tkd/drafts");
      const data = await safeJson(res);
      if (res.ok && Array.isArray(data.drafts)) setDrafts(data.drafts as DraftItem[]);
    } catch {
      /* 草稿讀取失敗不擋畫面 */
    }
  }
  useEffect(() => {
    loadDrafts();
  }, []);

  // 打 /api/tkd 背景任務並輪詢，回傳結果（兩階段共用）
  async function runTkdJob(body: Record<string, unknown>): Promise<TkdResult> {
    const res = await fetch("/api/tkd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(String(data.error || "發生錯誤"));
    const jobId = String(data.jobId || "");
    if (!jobId) throw new Error("伺服器沒有回傳任務 id");
    return pollJob<TkdResult>("/api/tkd", jobId, setProgress);
  }

  // 階段一：把勾選頁的「現有 TKD」寫入登記表，並存成草稿
  async function handleWriteExisting() {
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
      await runTkdJob({
        stage: "existing",
        siteUrl,
        sheetUrl,
        pages: selected.map((p) => ({ url: p.url, label: p.label, type: p.type })),
      });
      // 收斂成「已追蹤的頁」（只留勾選的，全部標記 include），進入階段二
      setCandidates(selected.map((p) => ({ ...p, include: true })));
      setDraftId(null); // 草稿改由使用者按「儲存草稿」才建立
      setDraftSaved(false);
      setStage1Done(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  // 儲存草稿：把目前這批已追蹤的頁存起來，之後可從「我的草稿」續做階段二
  async function handleSaveDraft() {
    if (!candidates) return;
    try {
      const res = await fetch("/api/tkd/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl,
          sheetUrl,
          scope,
          pages: candidates.map((p) => ({ url: p.url, label: p.label, type: p.type })),
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(String(data.error || "儲存草稿失敗"));
      setDraftId(typeof data.id === "number" ? data.id : null);
      setDraftSaved(true);
      loadDrafts();
      // 存好草稿就跳回網站健檢工具 hub
      router.push("/seo-check");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // 階段二：對已追蹤的頁生成建議 TKD，寫回建議欄
  async function handleGenerateSuggest() {
    if (!candidates) return;
    const selected = candidates.filter((p) => p.include);
    if (selected.length === 0) {
      setError("至少要有一頁");
      return;
    }
    setGenerating(true);
    setError("");
    setProgress("任務啟動中…"); // 不清舊 result：微調重跑時畫面不會閃回勾選區
    try {
      const r = await runTkdJob({
        stage: "suggest",
        siteUrl,
        sheetUrl,
        // 有草稿就用 draftId 讓後端從草稿載入；沒有就直接帶勾選頁
        draftId: draftId ?? undefined,
        pages: draftId ? undefined : selected.map((p) => ({ url: p.url, label: p.label, type: p.type })),
        extraKeywords,
        notes,
      });
      setResult(r);
      // 建議已生成＝這批草稿的任務完成，從待辦清單移除；但常駐草稿要留著（固定測試用）
      if (draftId && !currentPinned) removeDraft(draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  // 開啟草稿：載入該草稿的頁面清單，直接進階段二（填關鍵字 → 生建議）
  async function openDraft(id: number) {
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/tkd/drafts?id=${id}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(String(data.error || "讀取草稿失敗"));
      const d = data.draft as {
        siteUrl: string;
        sheetUrl: string;
        scope: "important" | "all";
        pinned?: boolean;
        pages: { url: string; label?: string; type?: string }[];
      };
      setSiteUrl(d.siteUrl);
      setSheetUrl(d.sheetUrl);
      setScope(d.scope);
      setCandidates(d.pages.map((p) => ({ url: p.url, label: p.label, type: p.type || "其他", include: true })));
      setPlatform(null); // 草稿沒存平台，續做時不顯示徽章
      setDraftId(id);
      setCurrentPinned(!!d.pinned); // 常駐草稿：生成後不自動刪
      setDraftSaved(true); // 從草稿載入的本來就是已存的
      setStage1Done(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // 刪除草稿
  async function removeDraft(id: number) {
    try {
      await fetch(`/api/tkd/drafts?id=${id}`, { method: "DELETE" });
      if (draftId === id) setDraftId(null);
      loadDrafts();
    } catch {
      /* 刪除失敗不擋畫面 */
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

  // 批量勾選分組：智慧選維度（多頁目錄夠多→依網址目錄，否則→依型態），每組都有全選/全不選
  const groups = candidates ? buildGroups(candidates) : [];
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

      {/* 我的草稿：階段一存下的批次，點「續做」直接進階段二 */}
      {drafts.length > 0 && !stage1Done && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="text-sm font-bold text-gray-800 mb-2">我的草稿（現有 TKD 已寫入，待生成建議）</h2>
          <ul className="divide-y divide-amber-100">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700 min-w-0">
                  {d.pinned && (
                    <span className="text-xs bg-orange-100 text-orange-600 rounded px-1.5 py-0.5 mr-2 font-medium">
                      📌 常駐
                    </span>
                  )}
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{d.updatedAt}</span>
                </span>
                <span className="flex gap-3 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => openDraft(d.id)}
                    className="text-orange-500 hover:text-orange-600 font-medium"
                  >
                    續做（生成建議）
                  </button>
                  {/* 常駐草稿（固定測試用）不給刪除鈕，避免誤刪 */}
                  {!d.pinned && (
                    <button
                      type="button"
                      onClick={() => removeDraft(d.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      刪除
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                {/* 偵測到的平台徽章（91APP 走專屬精準分類，其餘走通用流程） */}
                {platform && (
                  <span
                    className={`inline-block text-[10px] font-medium border rounded px-1.5 py-0.5 ${PLATFORM_BADGE[platform].cls}`}
                  >
                    {PLATFORM_BADGE[platform].label}
                  </span>
                )}
                {stage1Done
                  ? `填關鍵字 → 生成建議 TKD（已追蹤 ${candidates.length} 頁）`
                  : `② 確認要收錄的頁面（已勾 ${selectedCount}／共 ${candidates.length} 頁）`}
              </h2>
              <p className="text-xs text-gray-400">
                {stage1Done
                  ? "現有 TKD 已寫入；填指定關鍵字後生成建議，也可先離開之後從「我的草稿」續做"
                  : "可用各組「全選/全不選」批量勾選；點網址可開新分頁確認"}
              </p>
            </div>

            {groups.map((g) => {
              const checkedCount = g.pages.filter((p) => p.include).length;
              const groupUrls = g.pages.map((p) => p.url);
              return (
                <div key={g.key} className="border border-gray-100 rounded-lg">
                  <div className="flex items-center justify-between bg-gray-50 rounded-t-lg px-3 py-2">
                    <span className="text-xs font-bold text-gray-700 break-all">
                      {g.key}
                      {g.tag && (
                        <span className="ml-1 text-[10px] font-normal text-gray-400 border border-gray-200 rounded px-1 align-middle">
                          {g.tag}
                        </span>
                      )}
                      （{checkedCount}／{g.pages.length}）
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

            {/* 階段一：只寫現有 TKD＋存草稿；階段二：填關鍵字 → 生建議 */}
            {!stage1Done ? (
              <button
                type="button"
                onClick={handleWriteExisting}
                disabled={generating || selectedCount === 0}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
              >
                {generating
                  ? progress || "處理中…"
                  : `① 寫入現有 TKD（追蹤 ${selectedCount} 頁）`}
              </button>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2">
                  ✓ 現有 TKD 已寫入登記表。可以馬上生成建議，或先「儲存草稿」下次再做。
                </div>
                {/* 指定關鍵字：階段二送出前讓使用者確認要納入建議的必含關鍵字 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    指定關鍵字（選填，逗號或空格分隔）
                  </label>
                  <input
                    type="text"
                    value={extraKeywords}
                    onChange={(e) => setExtraKeywords(e.target.value)}
                    placeholder="例：台中網頁設計 SEO優化 RWD網站"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    可以一次給很多個，AI 會逐頁判斷相關性，只把跟該頁相關的詞納入建議 TKD，不會全部硬塞
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateSuggest}
                    disabled={generating || selectedCount === 0}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
                  >
                    {generating
                      ? progress || "處理中…"
                      : `② 生成建議 TKD（${selectedCount} 頁）`}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={generating || draftSaved}
                    className="border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2"
                  >
                    {draftSaved ? "✓ 已儲存草稿" : "儲存草稿（下次再做）"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 第②步結果 */}
      {result && (
        <div className="mt-6 space-y-4">
          {result.previewOnly ? (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">
              🔍 只預覽模式（sheet 留空，未寫回登記表）：掃描 {result.pageCount} 頁，以下為 AI 生成的建議
              TKD，可直接在這裡檢查關鍵字使用狀況。要正式寫回時再填入 sheet 網址即可。
            </div>
          ) : (
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
          )}

          {/* 逐頁結果表格 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">頁面</th>
                  <th className="text-left px-3 py-2 font-medium">建議 title</th>
                  <th className="text-left px-3 py-2 font-medium">建議 description</th>
                  <th className="text-left px-3 py-2 font-medium">建議 keywords</th>
                  <th className="text-left px-3 py-2 font-medium">建議 H1</th>
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
                    <td className="px-3 py-2 text-gray-700">{p.suggest?.title}</td>
                    <td className="px-3 py-2 text-gray-700">{p.suggest?.description}</td>
                    <td className="px-3 py-2 text-gray-700">{p.suggest?.keywords}</td>
                    <td className="px-3 py-2 text-gray-700">{p.suggest?.h1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 微調重生：補關鍵字 / 給修正指示，讓 AI 重新生成並覆寫建議欄 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">微調重生（補關鍵字 / 修正錯字）</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">補充關鍵字（選填，逗號或空格分隔）</label>
              <input
                type="text"
                value={extraKeywords}
                onChange={(e) => setExtraKeywords(e.target.value)}
                placeholder="例：GIA 求婚戒指 八心八箭"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">修正指示（選填）</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="例：正確用詞是「八心八箭」，不是「8新8戒」；品牌名保留 Polello"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <p className="text-xs text-gray-400 mt-1">
                會對同一批已追蹤的頁重新生成建議、覆寫登記表的建議欄；優先權高於一切，AI 一定遵守。
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateSuggest}
              disabled={generating}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
            >
              {generating ? progress || "處理中…" : "重新生成建議（微調）"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
