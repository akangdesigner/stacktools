"use client";

import { useState, useEffect, useCallback } from "react";

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
  stage?: number;   // 所屬階段（1 或 2）
  details?: { url: string; note: string }[]; // 具體問題頁清單（給「查看更多」展開用）
}
interface AuditResult {
  url: string;
  stage?: number;
  checks: CheckItem[];
}

// 草稿清單項（對應 /api/site-audit/drafts）
interface DraftItem {
  id: number;
  name: string;
  url: string;
  sheetUrl: string;
  createdAt: string;
  updatedAt: string;
}

// 狀態對應的顯示樣式（對齊表上用語：正常 / 可優化 / 需處理）
const STATUS_UI: Record<CheckStatus, { badge: string; text: string }> = {
  ok: { badge: "bg-green-50 text-green-700 border-green-200", text: "正常" },
  warn: { badge: "bg-amber-50 text-amber-700 border-amber-200", text: "可優化" },
  fail: { badge: "bg-red-50 text-red-700 border-red-200", text: "需處理" },
};

// 兩階段標題（對齊進度表的兩份報告）
const STAGE_LABEL: Record<number, string> = {
  1: "報告1：網站 SEO 基礎健檢與可行性評估",
  2: "報告2：SEO 結構與內容優化規劃",
};

// 網址顯示成路徑（去掉網域），連結仍用完整網址
function urlToPath(u: string) {
  return u.replace(/^https?:\/\/[^/]+/, "") || "/";
}

// 「查看更多」：點開彈窗列出該項目具體是哪些頁有問題（可捲動，不撐開表格）
function DetailsToggle({ title, details }: { title: string; details: { url: string; note: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-orange-600 hover:text-orange-700 hover:underline whitespace-nowrap"
      >
        查看更多（{details.length} 頁）
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[75vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題列 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
              <p className="text-sm font-semibold text-gray-800">
                {title}
                <span className="ml-2 text-xs font-normal text-gray-400">{details.length} 個問題頁面</span>
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            {/* 清單（可捲動）*/}
            <div className="overflow-y-auto overflow-x-hidden px-5 py-2 divide-y divide-gray-50">
              {details.map((d, i) => (
                <div key={i} className="py-2.5 flex gap-3 text-xs leading-relaxed">
                  <span className="text-gray-300 tabular-nums shrink-0 w-6 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all font-mono block"
                      title={d.url}
                    >
                      {urlToPath(d.url)}
                    </a>
                    <p className="text-gray-400 mt-0.5 break-all">{d.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 只留寫回進度表需要的欄位
function toWriteChecks(checks: CheckItem[]) {
  return checks.map((c) => ({ level: c.level, category: c.category, item: c.item, status: c.status, advice: c.advice }));
}

// 單一階段的結果表格（標題 + 小計 + 表格）；readonly 只是語意上表示「已登記」的階段一
function StageTable({ stage, rows, tag }: { stage: number; rows: CheckItem[]; tag?: string }) {
  if (rows.length === 0) return null;
  const sc = rows.reduce(
    (acc, c) => ((acc[c.status] += 1), acc),
    { ok: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>,
  );
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-base font-bold text-gray-800">
          <span className="text-orange-500">階段{stage === 1 ? "一" : "二"}</span>
          　{STAGE_LABEL[stage]}
          {tag && <span className="ml-2 text-xs font-normal text-gray-400">{tag}</span>}
        </h2>
        <div className="flex gap-2 text-xs">
          <span className="text-red-600">需處理 {sc.fail}</span>
          <span className="text-amber-600">可優化 {sc.warn}</span>
          <span className="text-green-600">正常 {sc.ok}</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse bg-white">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-3 py-2 font-medium whitespace-nowrap">影響層級</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">分類</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">狀態</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">確認事項</th>
              <th className="px-3 py-2 font-medium">SEO 建議事項</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">問題頁面</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const ui = STATUS_UI[c.status];
              return (
                <tr key={c.key} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.level}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.category}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${ui.badge}`}>{ui.text}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">{c.item}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.advice}
                    {c.evidence && <div className="text-xs text-gray-400 mt-1 break-all">{c.evidence}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {c.details && c.details.length > 0 ? (
                      <DetailsToggle title={c.item} details={c.details} />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SiteAuditPage() {
  // 目前在哪一階段：1＝基礎健檢（上半）、2＝結構與內容（下半，續做草稿時）
  const [stage, setStage] = useState<1 | 2>(1);
  const [draftId, setDraftId] = useState<number | null>(null); // 續做中的草稿 id
  const [stage1Checks, setStage1Checks] = useState<CheckItem[]>([]); // 續做時帶入的階段一結果（顯示用）

  const [url, setUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  const [progressMsg, setProgressMsg] = useState(""); // 爬取/分析進度

  const [writing, setWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

  // 載入草稿清單
  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/site-audit/drafts");
      const data = await res.json();
      if (res.ok && Array.isArray(data.drafts)) setDrafts(data.drafts);
    } catch {
      /* 清單載入失敗就先不擋畫面 */
    }
  }, []);
  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // 執行健檢（開背景 job → 輪詢進度）
  async function handleAudit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setWriteMsg(null);
    setProgressMsg("建立健檢工作…");
    try {
      const res = await fetch("/api/site-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "健檢失敗");
      await pollJob(data.jobId as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "健檢失敗");
      setLoading(false);
      setProgressMsg("");
    }
  }

  // 輪詢背景 job 直到完成／失敗（最多等 8 分鐘）
  async function pollJob(jobId: string) {
    const started = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - started > 8 * 60 * 1000) throw new Error("健檢逾時，請縮小網站或稍後再試");
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/site-audit/status?id=${jobId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "查詢進度失敗");
      if (d.status === "crawling") {
        setProgressMsg(`爬取中：已爬 ${d.progress.crawled} 頁（發現 ${d.progress.discovered} 頁，上限 ${d.progress.cap}）`);
      } else if (d.status === "analyzing") {
        setProgressMsg(d.message || "彙總分析中…");
      } else if (d.status === "completed") {
        setResult({ url: d.url, stage: d.stage, checks: d.checks });
        setProgressMsg("");
        setLoading(false);
        return;
      } else if (d.status === "failed") {
        throw new Error(d.error ?? "健檢失敗");
      }
    }
  }

  // 寫回進度表（把目前階段的結果寫回）
  async function handleWrite() {
    if (!result) return;
    setWriting(true);
    setWriteMsg(null);
    try {
      const res = await fetch("/api/site-audit/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl, checks: toWriteChecks(result.checks) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "寫入失敗");
      const ap = data.appended ? `，另補上 ${data.appended} 列新項目（${data.appendedItems.join("、")}）` : "";
      setWriteMsg({ ok: true, text: `已更新 ${data.updated} 列狀態${ap}` });
    } catch (err) {
      setWriteMsg({ ok: false, text: err instanceof Error ? err.message : "寫入失敗" });
    } finally {
      setWriting(false);
    }
  }

  // 儲存草稿（做完階段一後，之後可續做階段二）
  async function handleSaveDraft() {
    if (!result) return;
    setSaving(true);
    setWriteMsg(null);
    try {
      const res = await fetch("/api/site-audit/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sheetUrl, stage1Checks: result.checks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "儲存草稿失敗");
      setWriteMsg({ ok: true, text: "已儲存草稿，之後可從下方「我的草稿」續做階段二" });
      await loadDrafts();
    } catch (err) {
      setWriteMsg({ ok: false, text: err instanceof Error ? err.message : "儲存草稿失敗" });
    } finally {
      setSaving(false);
    }
  }

  // 從草稿續做階段二
  async function handleResume(id: number) {
    setError("");
    try {
      const res = await fetch(`/api/site-audit/drafts?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "載入草稿失敗");
      const d = data.draft as { id: number; url: string; sheetUrl: string; stage1Checks: CheckItem[] };
      setStage(2);
      setDraftId(d.id);
      setUrl(d.url);
      setSheetUrl(d.sheetUrl);
      setStage1Checks(d.stage1Checks ?? []);
      setResult(null);
      setWriteMsg(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入草稿失敗");
    }
  }

  // 刪除草稿
  async function handleDeleteDraft(id: number) {
    try {
      await fetch(`/api/site-audit/drafts?id=${id}`, { method: "DELETE" });
      await loadDrafts();
    } catch {
      /* 刪除失敗就略過 */
    }
  }

  // 回到階段一（放棄續做）
  function backToStage1() {
    setStage(1);
    setDraftId(null);
    setStage1Checks([]);
    setResult(null);
    setUrl("");
    setSheetUrl("");
    setError("");
    setWriteMsg(null);
  }

  // 完成：階段二寫回後刪掉草稿，回到階段一
  async function handleFinish() {
    if (draftId == null) return;
    setFinishing(true);
    try {
      await fetch(`/api/site-audit/drafts?id=${draftId}`, { method: "DELETE" });
      await loadDrafts();
      backToStage1();
      setWriteMsg({ ok: true, text: "兩階段皆完成，草稿已清除" });
    } catch (err) {
      setWriteMsg({ ok: false, text: err instanceof Error ? err.message : "清除草稿失敗" });
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">網站技術健檢</h1>
        <p className="text-sm text-gray-500 mt-1">
          依「網站技術優化進度」表分兩階段：<b>階段一</b>先登記基礎健檢（上半 10 項）並儲存草稿，之後從「我的草稿」續做 <b>階段二</b>（結構與內容 12 項）。共 22 項、一項都不少。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          分析方式：<b>爬全站</b>讀內容（TKD、h 標籤、圖片、連結、Schema…）＋<b>GSC 實測</b>收錄狀態（「有無建立索引」直接查 Search Console）。
        </p>
      </div>

      {/* 階段指示 */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className={`rounded-full px-3 py-1 font-medium ${stage === 1 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>階段一・基礎健檢</span>
        <span className="text-gray-300">→</span>
        <span className={`rounded-full px-3 py-1 font-medium ${stage === 2 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}>階段二・結構與內容</span>
        {stage === 2 && (
          <button type="button" onClick={backToStage1} className="ml-2 text-xs text-gray-400 underline hover:text-gray-600">
            返回階段一
          </button>
        )}
      </div>

      {/* 續做階段二時的草稿資訊 */}
      {stage === 2 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          續做草稿：<b className="break-all">{url}</b>　（階段一已登記 {stage1Checks.length} 項，完成階段二寫回後即可清除草稿）
        </div>
      )}

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
              disabled={stage === 2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              填首頁或任一頁網址即可，會以該網域為準爬全站分析（sitemap、孤島、TKD、圖片等皆為全站總體）。{stage === 2 && "（續做階段二沿用草稿網址）"}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">進度表網址</label>
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="要寫回結果時填含分頁 gid 的 Google Sheet 網址"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <p className="text-xs text-gray-400 mt-1">從瀏覽器切到目標分頁後直接複製網址即可，會自動辨識要寫入的分頁。</p>
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2"
          >
            {loading ? "健檢中…" : stage === 1 ? "開始階段一健檢" : "開始階段二健檢"}
          </button>
          {loading && progressMsg ? (
            <div className="flex items-center gap-2 text-xs text-orange-600">
              <span className="inline-block w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" />
              {progressMsg}
            </div>
          ) : (
            <p className="text-xs text-gray-400">會從首頁爬第一～二層＋補爬 sitemap（上限 1000 頁）做全站內容分析，並用 GSC 實測收錄狀態；網站較大時需要一點時間。</p>
          )}
        </div>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {result && (
        <div className="mt-6">
          <div className="text-sm text-gray-500 mb-3">
            健檢對象：<span className="text-gray-700 break-all">{result.url}</span>
          </div>

          {/* 續做階段二時，先秀出已登記的階段一（唯讀） */}
          {stage === 2 && stage1Checks.length > 0 && <StageTable stage={1} rows={stage1Checks} tag="（已登記）" />}

          {/* 本次健檢的結果 */}
          <StageTable stage={stage} rows={result.checks} tag="（本次）" />

          {/* 動作區：寫回 + 儲存草稿（階段一）/ 完成（階段二）*/}
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center flex-wrap justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-700">寫回進度表（階段{stage === 1 ? "一" : "二"}）</div>
                <p className="text-xs text-gray-400 mt-1">
                  依「確認事項」比對更新「狀態」欄；表上沒有的項目會補一整列到分頁尾端。
                  {!sheetUrl.trim() && <span className="text-amber-600">　請先於上方填進度表網址。</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleWrite}
                  disabled={writing || !sheetUrl.trim()}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2 whitespace-nowrap"
                >
                  {writing ? "寫入中…" : "寫入進度表"}
                </button>
                {stage === 1 ? (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 text-sm font-medium rounded-lg px-5 py-2 whitespace-nowrap"
                  >
                    {saving ? "儲存中…" : "儲存草稿（續做階段二）"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={finishing}
                    className="border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 text-sm font-medium rounded-lg px-5 py-2 whitespace-nowrap"
                  >
                    {finishing ? "清除中…" : "完成（清除草稿）"}
                  </button>
                )}
              </div>
            </div>
            {writeMsg && (
              <div
                className={`text-sm rounded-lg px-4 py-2 ${
                  writeMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-600"
                }`}
              >
                {writeMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 我的草稿：續做階段二 */}
      {stage === 1 && drafts.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-bold text-gray-800 mb-2">我的草稿</h2>
          <div className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center flex-wrap justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{d.name}</div>
                  <div className="text-xs text-gray-400 truncate break-all">{d.url}　·　{d.updatedAt}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleResume(d.id)}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-1.5 whitespace-nowrap"
                  >
                    續做階段二
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDraft(d.id)}
                    className="text-gray-400 hover:text-red-500 text-sm rounded-lg px-3 py-1.5"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
