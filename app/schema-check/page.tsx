"use client";

import { useState } from "react";

// 單一 JSON-LD 節點的檢查結果（對應後端 /api/schema-check 回傳的 evals）
interface DisplayField {
  label: string;
  value: string;
}
interface NodeEval {
  node: Record<string, unknown>;
  types: string[];
  label: "" | "LocalBusiness" | "Product" | "Article";
  missing: string[];
  fields: DisplayField[];
}
// 單一網址的檢查結果（source：首頁 / 自動找到的相關頁）
interface PageResult {
  url: string;
  source: string;
  types: string[];
  evals: NodeEval[];
}

const LABEL_TEXT: Record<NodeEval["label"], string> = {
  LocalBusiness: "在地商家",
  Product: "商品",
  Article: "文章",
  "": "",
};

// 單一 JSON-LD 節點卡片：好讀欄位清單 + 收合的原始 JSON
function NodeCard({ ev, copied, onCopy }: { ev: NodeEval; copied: boolean; onCopy: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center flex-wrap justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">{ev.types.join("、") || "（無 @type）"}</span>
          {ev.label && (
            <span className="text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
              {LABEL_TEXT[ev.label]}關鍵型別
            </span>
          )}
          {ev.label && ev.missing.length === 0 && (
            <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
              欄位完整
            </span>
          )}
          {ev.label && ev.missing.length > 0 && (
            <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              缺：{ev.missing.join("、")}
            </span>
          )}
        </div>
        <button type="button" onClick={onCopy} className="text-xs text-orange-600 hover:text-orange-700 hover:underline whitespace-nowrap">
          {copied ? "已複製 ✓" : "複製 JSON"}
        </button>
      </div>

      {ev.fields.length > 0 ? (
        <dl className="divide-y divide-gray-50">
          {ev.fields.map((f, j) => (
            <div key={j} className="flex gap-3 px-4 py-2 text-sm">
              <dt className="w-28 shrink-0 text-gray-400">{f.label}</dt>
              <dd className="text-gray-700 break-all">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-4 py-3 text-xs text-gray-400">這個節點沒有解析到可呈現的欄位（可能只有 @type，其餘欄位是巢狀物件或空的）。</p>
      )}

      <details className="border-t border-gray-100">
        <summary className="px-4 py-2 text-xs text-gray-400 cursor-pointer hover:text-gray-600">查看原始 JSON-LD</summary>
        <pre className="bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
          {JSON.stringify(ev.node, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function SchemaCheckPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [noCandidatesFound, setNoCandidatesFound] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleCheck(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    setNoCandidatesFound(false);
    try {
      const res = await fetch("/api/schema-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "抓取失敗");
      setResults(data.results as PageResult[]);
      setNoCandidatesFound(!!data.noCandidatesFound);
    } catch (err) {
      setError(err instanceof Error ? err.message : "抓取失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(key: string, node: Record<string, unknown>) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(node, null, 2));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* 複製失敗就略過 */
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Schema 檢查工具</h1>
        <p className="text-sm text-gray-500 mt-1">
          貼一個網址，直接抓真實部署的 JSON-LD 結構化資料（不是叫 AI 猜），並核對在地商家 / 商品 / 文章常見的關鍵欄位有沒有缺。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          會自動抓首頁，並從頁內連結找「聯絡我們／關於我們」之類看起來相關的頁面一併檢查——在地商家資料常只掛在這類頁面，不一定在首頁。
        </p>
      </div>

      <form onSubmit={handleCheck}>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              網址 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {loading ? "抓取中…" : "抓取 Schema"}
          </button>
        </div>
      </form>

      {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

      {noCandidatesFound && (
        <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
          首頁靜態原始碼裡沒找到「聯絡我們」之類的連結（通常是選單用 JS 動態產生），只抓到首頁。若你知道聯絡我們頁的網址，直接貼那個網址再查一次。
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-8">
          {results.map((r, pi) => (
            <div key={pi} className="space-y-3">
              <div className="text-sm text-gray-500 border-b border-gray-100 pb-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {r.source}
                </span>
                <span className="text-gray-700 break-all">{r.url}</span>
              </div>

              {r.evals.length === 0 ? (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
                  這個網址沒有偵測到任何 JSON-LD 結構化資料。
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    偵測到型別：
                    {r.types.map((t) => (
                      <span key={t} className="ml-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                  {r.evals.map((ev, i) => {
                    const key = `${pi}-${i}`;
                    return <NodeCard key={key} ev={ev} copied={copiedKey === key} onCopy={() => handleCopy(key, ev.node)} />;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
