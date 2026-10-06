"use client";

import { useEffect, useMemo, useState } from "react";

// 文案法規檢查：貼文章網址或文字 → 選客戶規則 → 每句列出禁詞命中與 Jev 風險分數

interface BannedWord {
  word: string;
  replace?: string;
  note?: string;
  group?: string; // 出自哪個產品的規範
}
interface ClientOption {
  id: string;
  name: string;
  source: string;
  banned: BannedWord[];
  required: string[];
}
type JevKey =
  | "medical_claim" | "body_change" | "solicitation" | "exaggeration"
  | "ai_contrast" | "ai_filler" | "ai_hype" | "ai_slang" | "ai_heading" | "ai_personify";
interface SentenceResult {
  text: string;
  banned: BannedWord[];
  jev: Partial<Record<JevKey, number>>;
  category: Category | null; // 這句所在段落的產品類別
  allowed: string[]; // 該類別官方明列可用的詞句
  jevError?: boolean;
}
interface Report {
  title: string;
  client: string;
  clientAuto: boolean; // 客戶是自動認出來的
  sentenceCount: number;
  required: { label: string; hint: string; ok: boolean }[];
  sentences: SentenceResult[];
  sections: { heading: string; category: Category; products: string[] }[]; // 各段落判斷的產品類別與產品
  cost: number;
  jevFailed: number;
}

// Jev 各題的顯示名稱（順序＝畫面上標籤順序）
const JEV_LABELS: Record<JevKey, string> = {
  medical_claim: "宣稱醫療效果",
  body_change: "改變身體機能",
  solicitation: "招攬／促銷",
  exaggeration: "誇大用語",
  ai_contrast: "AI 味反轉句",
  ai_filler: "AI 味報幕／過渡詞",
  ai_hype: "AI 味浮誇詞",
  ai_slang: "AI 味社群假詞",
  ai_heading: "AI 味標題",
  ai_personify: "AI 味假擬人",
};
// 「是」的機率 ≥ 0.6 才算命中：She is 文章實測 0.5～0.6 幾乎都是誤判（一般衛教句被當成反轉句、誇大），真問題都在 0.6 以上
const JEV_THRESHOLD = 0.6;
// 法規風險和 AI 味分開判斷、分開列
const LEGAL_KEYS: JevKey[] = ["medical_claim", "body_change", "solicitation", "exaggeration"];
// 題目內容在 lib/compliance-check.ts，依小積木的去 AI 味規則
const AI_KEYS: JevKey[] = ["ai_contrast", "ai_filler", "ai_hype", "ai_slang", "ai_heading", "ai_personify"];
type Category = "cosmetic" | "food" | "device" | "textile" | "medical";
// 整篇主要類別：段落裡出現最多次的類別
const mainCategory = (sections: Report["sections"]): Category => {
  const count = new Map<Category, number>();
  for (const s of sections) count.set(s.category, (count.get(s.category) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
};

const CATEGORY_LABELS: Record<Category, string> = {
  cosmetic: "化粧品",
  food: "食品",
  device: "醫療器材",
  textile: "紡織品",
  medical: "醫療院所",
};
const STORAGE_KEY = "compliance-check:extra-banned"; // 自訂禁詞依客戶存在瀏覽器

type Rewrite = { loading: boolean; text?: string; error?: string; applied?: boolean };
type Mode = "legal" | "ai"; // 一開始選：檢查法規（禁詞＋法規風險）或檢查 AI 味

function jevHits(s: SentenceResult, keys: JevKey[]): [JevKey, number][] {
  return (Object.entries(s.jev) as [JevKey, number][])
    .filter(([k, v]) => keys.includes(k) && v >= JEV_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);
}

export default function ComplianceCheckPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("auto"); // auto＝從網址和內文自動認客戶
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [extraBanned, setExtraBanned] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<Mode>("legal");
  // 每句的改寫結果（key＝原句）：按「改寫」才呼叫 AI，不按不花錢
  const [rewrites, setRewrites] = useState<Record<string, Rewrite>>({});

  useEffect(() => {
    fetch("/api/compliance-check")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setError("讀取客戶規則失敗"));
  }, []);

  // 從寫手流程工具按「到文案法規檢查」過來：把它存的文章文字帶進「貼上文字」，用完就清掉
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("from") !== "writer") return;
    try {
      const prefill = localStorage.getItem("compliance-check:prefill");
      if (prefill) {
        setInputMode("text"); // eslint-disable-line react-hooks/set-state-in-effect
        setText(prefill);
        localStorage.removeItem("compliance-check:prefill");
      }
    } catch { /* 讀不到就維持空白 */ }
  }, []);

  // 切換客戶時載入該客戶的自訂禁詞
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, string>;
      setExtraBanned(all[clientId] ?? "");
    } catch {
      setExtraBanned("");
    }
  }, [clientId]);

  const saveExtra = (value: string) => {
    setExtraBanned(value);
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, string>;
      all[clientId] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // 瀏覽器不給存就算了，不影響檢查
    }
  };

  const client = clients.find((c) => c.id === clientId);

  const run = async () => {
    setLoading(true);
    setError("");
    setReport(null);
    setRewrites({});
    try {
      const res = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          clientId,
          extraBanned,
          ...(inputMode === "url" ? { url } : { text }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "檢查失敗");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    if (!report) return null;
    const banned = report.sentences.filter((s) => s.banned.length > 0).length;
    const legal = report.sentences.filter((s) => jevHits(s, LEGAL_KEYS).length > 0).length;
    return { banned, legal };
  }, [report]);

  const visible = useMemo(() => {
    if (!report) return [];
    if (mode === "ai") return report.sentences.filter((s) => jevHits(s, AI_KEYS).length > 0);
    // 法規模式：禁詞和法規風險合成一個清單，有禁詞（一定要改）的句子排前面
    const flagged = report.sentences.filter((s) => s.banned.length > 0 || jevHits(s, LEGAL_KEYS).length > 0);
    return [...flagged.filter((s) => s.banned.length > 0), ...flagged.filter((s) => s.banned.length === 0)];
  }, [report, mode]);

  // 換模式時清掉舊結果，避免法規結果留在 AI 味畫面上
  const switchMode = (m: Mode) => {
    setMode(m);
    setReport(null);
    setRewrites({});
    setError("");
  };

  // 這句被抓到的問題（畫面上看到的標籤），帶給 AI 當改寫方向
  const issuesOf = (s: SentenceResult) => [
    ...(mode === "legal"
      ? s.banned.map((b) => `禁詞「${b.word}」${b.replace ? `（建議改「${b.replace}」）` : ""}`)
      : []),
    ...jevHits(s, mode === "ai" ? AI_KEYS : LEGAL_KEYS).map(([k]) => JEV_LABELS[k]),
  ];

  const rewrite = async (s: SentenceResult) => {
    setRewrites((r) => ({ ...r, [s.text]: { loading: true } }));
    try {
      const res = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite", sentence: s.text, issues: issuesOf(s) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "改寫失敗");
      setRewrites((r) => ({ ...r, [s.text]: { loading: false, text: data.rewritten } }));
    } catch (e) {
      setRewrites((r) => ({ ...r, [s.text]: { loading: false, error: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // 套用：把貼上文字框裡的原句換成改寫版（只有貼上文字模式能套，網址抓的文章改不回原站）
  const applyRewrite = (original: string, rewritten: string) => {
    if (!text.includes(original)) {
      setRewrites((r) => ({ ...r, [original]: { ...r[original], loading: false, error: "文字框裡找不到原句（可能已經改過），請手動複製" } }));
      return;
    }
    setText((t) => t.replace(original, rewritten));
    setRewrites((r) => ({ ...r, [original]: { ...r[original], loading: false, applied: true } }));
  };

  const canRun = !loading && (inputMode === "url" ? url.trim() : text.trim());

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">文案法規檢查</h1>
        <p className="text-sm text-gray-500 mt-1">
          先選要檢查法規還是 AI 味。法規＝客戶禁詞（程式比對）＋法規風險（Jev 判斷換句話說的療效宣稱或招攬）；AI 味＝Jev 依去 AI 味規則逐句抓（反轉句、報幕、浮誇詞、社群假詞、標題、假擬人）。結果是高風險提示，最後仍要人確認。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        {/* 檢查模式 */}
        <div className="flex gap-2">
          {(
            [
              ["legal", "⚖️ 檢查法規（禁詞＋法規風險）"],
              ["ai", "🤖 檢查 AI 味"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`text-sm font-medium px-4 py-2 rounded-lg border-2 ${
                mode === m ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "legal" && (
        <>
        {/* 客戶規則 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">客戶規則</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="auto">自動判斷</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {client && client.id !== "general" && (
            <p className="text-xs text-gray-400 mt-1">
              來源：{client.source}．內建禁詞 {client.banned.length} 個
              {client.required.length > 0 && `．必備項目：${client.required.join("、")}`}
              <button type="button" onClick={() => setShowRules((v) => !v)} className="ml-2 text-orange-600 hover:underline">
                {showRules ? "收合" : "看禁詞"}
              </button>
            </p>
          )}
          {showRules && client && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.banned.map((b) => (
                <span key={b.word} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                  {b.group && <span className="text-gray-400">{b.group}：</span>}
                  {b.word}
                  {b.replace && <span className="text-green-600"> → {b.replace}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 自訂禁詞 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            補充禁詞 <span className="text-xs font-normal text-gray-400">一行一個，可寫「禁詞=&gt;替換詞」，會記在這台電腦</span>
          </label>
          <textarea
            value={extraBanned}
            onChange={(e) => saveExtra(e.target.value)}
            rows={2}
            placeholder={"例如：\n根治\n腸道=>消化道"}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
        </>
        )}

        {/* 文章輸入 */}
        <div>
          <div className="flex gap-2 mb-2">
            {(["url", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setInputMode(m)}
                className={`text-sm px-3 py-1 rounded-lg border ${
                  inputMode === m ? "bg-gray-900 text-white border-gray-900" : "text-gray-500 border-gray-300 hover:border-gray-400"
                }`}
              >
                {m === "url" ? "文章網址" : "貼上文字"}
              </button>
            ))}
          </div>
          {inputMode === "url" ? (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://blog.example.com/article/"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="把文章內文貼在這裡"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          )}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {loading ? "檢查中…（一篇約 10～20 秒）" : "開始檢查"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {report && counts && (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-gray-500">
            {report.title && <span className="font-medium text-gray-800">{report.title}</span>}
            {report.jevFailed > 0 && <span className="text-red-500">．{report.jevFailed} 句 Jev 判斷失敗</span>}
            {mode === "legal" && report.sections.length > 0 && (
              <div className="mt-1 text-xs space-y-0.5">
                <div>
                  客戶：<span className="text-orange-600">{report.client}</span>{report.clientAuto && "（自動判斷）"}．文章類別：
                  <span className="text-orange-600">{CATEGORY_LABELS[mainCategory(report.sections)]}</span>
                  {report.sections.some((sec) => sec.products.length > 0 || sec.category !== mainCategory(report.sections)) && "，另外這幾段有講到產品："}
                </div>
                {/* 只列有講到客戶產品、或類別跟整篇不同的段落；FAQ、衛教這類一般段落不列 */}
                {report.sections
                  .filter((sec) => sec.products.length > 0 || sec.category !== mainCategory(report.sections))
                  .map((sec, i) => (
                  <div key={i} className="pl-3">
                    {sec.heading || "（開頭）"} → <span className="text-orange-600">{CATEGORY_LABELS[sec.category]}</span>
                    {sec.products.length > 0 && <span className="text-orange-600">／{sec.products.join("、")}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {report.required.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">必備項目</h2>
              <ul className="space-y-1">
                {report.required.map((r) => (
                  <li key={r.label} className="text-sm">
                    {r.ok ? (
                      <span className="text-green-600">✓ {r.label}</span>
                    ) : (
                      <span className="text-red-600">
                        ✗ 缺少{r.label}：<span className="text-gray-500">{r.hint}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "legal" && (
            <p className="text-sm text-gray-600">
              🔴 禁詞 {counts.banned} 句（一定要改）．🟠 法規風險 {counts.legal} 句（AI 判斷，要人看）
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {visible.length === 0 && <p className="p-4 text-sm text-gray-400">沒有符合的句子</p>}
            {visible.map((s, i) => (
              <div key={i} className="p-4">
                <p className="text-sm text-gray-800 leading-relaxed">{s.text}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {mode === "legal" && s.banned.map((b) => (
                    <span key={b.word} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">
                      禁詞「{b.word}」{b.replace && ` → 改「${b.replace}」`}
                      {b.group && `（${b.group}規範）`}
                      {b.note && !b.replace && !b.group && `（${b.note}）`}
                    </span>
                  ))}
                  {jevHits(s, mode === "ai" ? AI_KEYS : LEGAL_KEYS).map(([k, v]) => (
                    <span
                      key={k}
                      className={`text-xs border rounded px-2 py-0.5 ${
                        AI_KEYS.includes(k) ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {JEV_LABELS[k]} {Math.round(v * 100)}%
                    </span>
                  ))}

                  {mode === "legal" && s.allowed.length > 0 && (
                    <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5">
                      {s.category && CATEGORY_LABELS[s.category]}可用：{s.allowed.join("、")}（有數據佐證的前提下）
                    </span>
                  )}
                  {s.jevError && <span className="text-xs text-gray-400">Jev 判斷失敗</span>}
                  {!rewrites[s.text]?.text && (
                    <button
                      type="button"
                      onClick={() => rewrite(s)}
                      disabled={rewrites[s.text]?.loading}
                      className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 disabled:text-gray-400 rounded px-2 py-0.5"
                    >
                      {rewrites[s.text]?.loading ? "改寫中…" : "✏️ 改寫"}
                    </button>
                  )}
                </div>
                {rewrites[s.text]?.error && <p className="text-xs text-red-600 mt-2">{rewrites[s.text].error}</p>}
                {rewrites[s.text]?.text && (
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-sm text-gray-800 leading-relaxed">{rewrites[s.text].text}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(rewrites[s.text].text!)}
                        className="text-xs text-gray-600 border border-gray-300 hover:bg-white rounded px-2 py-0.5"
                      >
                        複製
                      </button>
                      {inputMode === "text" && (
                        <button
                          type="button"
                          onClick={() => applyRewrite(s.text, rewrites[s.text].text!)}
                          disabled={rewrites[s.text].applied}
                          className="text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-green-600 rounded px-2 py-0.5"
                        >
                          {rewrites[s.text].applied ? "✓ 已套用到文字框" : "套用"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => rewrite(s)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5"
                      >
                        重新改寫
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
