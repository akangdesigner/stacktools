"use client";

import { useState } from "react";

// 單項檢查結果（對應後端 CheckResult，前端自宣告避免把 HTML parser 拉進 client bundle）
type CheckStatus = "ok" | "warn" | "fail";
interface CheckItem {
  key: string;
  level: string;    // 影響層級
  category: string; // 分類
  item: string;     // 確認事項
  status: CheckStatus;
  advice: string;   // SEO 建議事項
  evidence?: string;
}
interface AuditResult {
  url: string;
  checks: CheckItem[];
}

// 狀態對應的顯示樣式（對齊表上用語：正常 / 可優化 / 需處理）
const STATUS_UI: Record<CheckStatus, { badge: string; text: string }> = {
  ok: { badge: "bg-green-50 text-green-700 border-green-200", text: "正常" },
  warn: { badge: "bg-amber-50 text-amber-700 border-amber-200", text: "可優化" },
  fail: { badge: "bg-red-50 text-red-700 border-red-200", text: "需處理" },
};

export default function SiteAuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/site-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "健檢失敗");
      setResult(data as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "健檢失敗");
    } finally {
      setLoading(false);
    }
  }

  // 頂部統計：各狀態各幾項
  const counts = result
    ? result.checks.reduce(
        (acc, c) => ((acc[c.status] += 1), acc),
        { ok: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>,
      )
    : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">網站技術健檢</h1>
        <p className="text-sm text-gray-500 mt-1">
          輸入一個網址，自動辨識 TKD、H 標籤、圖片 ALT、結構化數據、E-E-A-T、站台檔案等技術指標，依「網站技術優化進度」表格式標出正常 / 可優化 / 需處理。
        </p>
      </div>

      <form onSubmit={handleAudit} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              網址 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/product/xxx"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              可貼任一頁面網址；站台檔案（sitemap / robots / llms）會以該網址的網域為準檢查。
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {loading ? "健檢中…" : "開始健檢"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {result && counts && (
        <div className="mt-6">
          {/* 頂部總覽 */}
          <div className="text-sm text-gray-500 mb-2">
            健檢對象：<span className="text-gray-700 break-all">{result.url}</span>
          </div>
          <div className="flex gap-3 mb-4">
            <span className="text-sm font-medium text-red-600">🔴 需處理 {counts.fail}</span>
            <span className="text-sm font-medium text-amber-600">🟡 可優化 {counts.warn}</span>
            <span className="text-sm font-medium text-green-600">🟢 正常 {counts.ok}</span>
          </div>

          {/* 結果表格：影響層級 / 分類 / 狀態 / 確認事項 / SEO 建議事項 */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">影響層級</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">分類</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">狀態</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">確認事項</th>
                  <th className="px-3 py-2 font-medium">SEO 建議事項</th>
                </tr>
              </thead>
              <tbody>
                {result.checks.map((c) => {
                  const ui = STATUS_UI[c.status];
                  return (
                    <tr key={c.key} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.level}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.category}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${ui.badge}`}>
                          {ui.text}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{c.item}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {c.advice}
                        {c.evidence && (
                          <div className="text-xs text-gray-400 mt-1 break-all">{c.evidence}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
