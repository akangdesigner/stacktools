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

// 型態分組顯示順序（跟 lib/tkd-classify.ts 的 PAGE_TYPES 一致；client 端不能 import 那支 lib）
const TYPE_ORDER = ["首頁", "形象頁", "分類頁", "產品頁", "部落格", "促銷", "功能頁", "其他"];

// 網址顯示用：還原中文 slug，失敗就原樣
function pretty(u: string): string {
  try {
    return decodeURI(u);
  } catch {
    return u;
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
  const [result, setResult] = useState<TkdResult | null>(null);

  // 第①步：蒐集候選頁＋AI 分類，列出勾選清單
  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    setCollecting(true);
    setError("");
    setCandidates(null);
    setResult(null);
    try {
      const res = await fetch("/api/tkd/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, limit, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      // 小積木拍板的預設勾選規則：只勾「有頁名」的（＝主選單抓到的頁），
      // sitemap 撈到的無頁名頁一律不勾，要收哪些由使用者自己點；AI 判斷只拿來分組
      setCandidates(
        (data.pages as CandidatePage[]).map((p) => ({ ...p, include: !!p.label })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCollecting(false);
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
    try {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setResult(data as TkdResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  // 切換單頁勾選
  function toggleOne(url: string) {
    setCandidates((prev) =>
      prev ? prev.map((p) => (p.url === url ? { ...p, include: !p.include } : p)) : prev,
    );
  }

  // 切換整組勾選（全選/全不選）
  function toggleGroup(type: string, include: boolean) {
    setCandidates((prev) =>
      prev ? prev.map((p) => (p.type === type ? { ...p, include } : p)) : prev,
    );
  }

  // 依型態分組（保持 TYPE_ORDER 順序，只列有頁的組）
  const groups = candidates
    ? TYPE_ORDER.map((type) => ({ type, pages: candidates.filter((p) => p.type === type) })).filter(
        (g) => g.pages.length > 0,
      )
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
            {collecting ? "蒐集頁面＋AI 判斷中…" : "① 蒐集頁面"}
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
                預設只勾主選單頁（有粗體頁名的），其餘請自行勾選；點網址可開新分頁確認
              </p>
            </div>

            {groups.map((g) => {
              const checkedCount = g.pages.filter((p) => p.include).length;
              return (
                <div key={g.type} className="border border-gray-100 rounded-lg">
                  <div className="flex items-center justify-between bg-gray-50 rounded-t-lg px-3 py-2">
                    <span className="text-xs font-bold text-gray-700">
                      {g.type}（{checkedCount}／{g.pages.length}）
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.type, true)}
                        className="text-orange-500 hover:text-orange-600"
                      >
                        全選
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.type, false)}
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
                ? "爬取＋AI 生成建議中…（頁數多會跑 1–2 分鐘）"
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
