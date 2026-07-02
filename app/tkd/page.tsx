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

export default function TkdPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [scope, setScope] = useState<"important" | "all">("important");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TkdResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/tkd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl, sheetUrl, limit, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setResult(data as TkdResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* 頁首 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">TKD 現況產生器</h1>
        <p className="text-sm text-gray-500 mt-1">
          輸入客戶網址與登記表網址 → 自動爬每頁現有 TKD、AI 生成建議 TKD → 一次寫回登記表（現有＋建議）
        </p>
      </div>

      {/* 表單 */}
      <form onSubmit={handleSubmit} className="space-y-4">
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
            <p className="text-xs text-gray-400 mt-1">會優先讀該站的 sitemap.xml；沒有時退回爬首頁內部連結</p>
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
                  重點頁（首頁／關於／服務／聯絡／部落格／商品）
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
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {loading ? "爬取＋AI 生成建議中…（頁數多會跑 1–2 分鐘）" : "開始產生 TKD（現有＋建議）"}
          </button>
        </div>
      </form>

      {/* 錯誤訊息 */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* 結果 */}
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
