"use client";

import { useState } from "react";

// llms.txt 產生結果（對應後端 LlmsResult）
interface LlmsResult {
  content: string;
  pageCount: number;
  llmsExists: boolean;
  usedGsc: boolean;
  curated: boolean;
}

export default function LlmsGeneratePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progressMsg, setProgressMsg] = useState("");
  const [gscInfo, setGscInfo] = useState<{ found: boolean; property?: string; pages: number } | null>(null);
  const [result, setResult] = useState<LlmsResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 執行：開背景 job → 輪詢進度
  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setGscInfo(null);
    setCopied(false);
    setProgressMsg("建立工作…");
    try {
      const res = await fetch("/api/llms-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "產生失敗");
      await pollJob(data.jobId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "產生失敗");
      setLoading(false);
      setProgressMsg("");
    }
  }

  // 輪詢背景 job 直到完成／失敗（最多等 8 分鐘）
  async function pollJob(jobId: string) {
    const started = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - started > 8 * 60 * 1000) throw new Error("逾時，請縮小網站或稍後再試");
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/llms-generate?id=${jobId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "查詢進度失敗");
      if (d.gsc) setGscInfo(d.gsc); // GSC 查完就即時顯示（不等爬完）
      if (d.status === "checking-gsc") {
        setProgressMsg("查詢 GSC 授權…");
      } else if (d.status === "crawling") {
        setProgressMsg(`爬取中：已爬 ${d.progress.crawled} 頁（發現 ${d.progress.discovered} 頁，上限 ${d.progress.cap}）`);
      } else if (d.status === "supplementing") {
        setProgressMsg(d.message || "從 sitemap 補抓爬不到的頁…");
      } else if (d.status === "building") {
        setProgressMsg(d.message || "AI 策展中…");
      } else if (d.status === "completed") {
        setResult(d.result as LlmsResult);
        setProgressMsg("");
        setLoading(false);
        return;
      } else if (d.status === "failed") {
        throw new Error(d.error ?? "產生失敗");
      }
    }
  }

  // 複製到剪貼簿
  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 複製失敗就略過 */
    }
  }

  // 下載為 llms.txt
  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">llms.txt 產生器</h1>
        <p className="text-sm text-gray-500 mt-1">
          輸入網址，會<b>爬全站</b>（首頁第一～二層、上限 300 頁）擷取每頁的 title / description，整理成符合{" "}
          <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">
            llmstxt.org
          </a>{" "}
          格式的 <code className="text-orange-600">llms.txt</code>，讓 AI 更好地理解你的網站。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          會用 AI <b>策展</b>：語意分類、精選 50～100 條重要頁、商品規格收斂、排掉活動促銷頁，而非把全站倒出來。（未設 AI key 時退回規則版）
        </p>
      </div>

      <form onSubmit={handleGenerate}>
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
            <p className="text-xs text-gray-400 mt-1">填首頁或任一頁網址即可，會以該網域為準爬全站。</p>
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {loading ? "產生中…" : "產生 llms.txt"}
          </button>
          {loading && progressMsg ? (
            <div className="flex items-center gap-2 text-xs text-orange-600">
              <span className="inline-block w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
              {progressMsg}
            </div>
          ) : (
            <p className="text-xs text-gray-400">網站較大時需要一點時間爬取。</p>
          )}
        </div>
      </form>

      {/* GSC 即時回饋：查完就出現，不用等爬完 */}
      {gscInfo && (
        <div
          className={`mt-4 text-sm rounded-lg px-4 py-3 border ${
            gscInfo.found ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"
          }`}
        >
          {gscInfo.found ? (
            <>
              ✓ 已找到 GSC 資源：<b className="break-all">{gscInfo.property}</b>
              <span className="text-emerald-600">（{gscInfo.pages} 頁有搜尋數據，將依曝光排序並補描述）</span>
            </>
          ) : (
            <>此網域不在你的 GSC 授權帳號內，將產出純爬蟲版。</>
          )}
        </div>
      )}

      {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}

      {result && (
        <div className="mt-6">
          <div className="flex items-center flex-wrap justify-between gap-2 mb-2">
            <div className="text-sm text-gray-500">
              {result.curated ? (
                <span className="mr-2 text-xs font-medium bg-sky-100 text-sky-700 rounded-full px-2 py-0.5">AI 策展版</span>
              ) : (
                <span className="mr-2 text-xs font-medium bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">規則版</span>
              )}
              收錄 <b className="text-gray-700">{result.pageCount}</b> 條
              {result.usedGsc ? (
                <span className="ml-2 text-xs text-emerald-600">已套用 GSC 搜尋成效（依曝光排序＋熱門搜尋詞補描述）</span>
              ) : (
                <span className="ml-2 text-xs text-gray-400">純爬蟲版（此網域未在 GSC 授權帳號內，未套用搜尋成效）</span>
              )}
              {result.llmsExists && <span className="ml-2 text-xs text-amber-600">此站已存在 llms.txt，這份為建議版</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-1.5"
              >
                {copied ? "已複製 ✓" : "複製"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="border border-orange-300 text-orange-600 hover:bg-orange-50 text-sm font-medium rounded-lg px-4 py-1.5"
              >
                下載 llms.txt
              </button>
            </div>
          </div>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
            {result.content}
          </pre>
          <p className="text-xs text-gray-400 mt-2">用法：把這份內容存成 <code className="text-orange-600">llms.txt</code>，放到網站根目錄（如 https://你的網域/llms.txt）。</p>
        </div>
      )}
    </div>
  );
}
