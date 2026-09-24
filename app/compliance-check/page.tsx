"use client";

import { useEffect, useMemo, useState } from "react";

// 文案法規檢查：貼文章網址或文字 → 選客戶規則 → 每句列出禁詞命中與 Jev 風險分數

interface BannedWord {
  word: string;
  replace?: string;
  note?: string;
}
interface ClientOption {
  id: string;
  name: string;
  source: string;
  banned: (BannedWord & { group?: string })[];
  required: string[];
  groups: string[]; // 產品分組（Relove 依產品分禁詞）
}
type JevKey = "medical_claim" | "body_change" | "solicitation" | "exaggeration" | "ai_contrast";
interface SentenceResult {
  text: string;
  banned: BannedWord[];
  jev: Partial<Record<JevKey, number>>;
  jevError?: boolean;
}
interface Report {
  title: string;
  client: string;
  sentenceCount: number;
  required: { label: string; hint: string; ok: boolean }[];
  sentences: SentenceResult[];
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
};
// 「是」的機率 ≥ 0.6 才算命中：She is 文章實測 0.5～0.6 幾乎都是誤判（一般衛教句被當成反轉句、誇大），真問題都在 0.6 以上
const JEV_THRESHOLD = 0.6;
const STORAGE_KEY = "compliance-check:extra-banned"; // 自訂禁詞依客戶存在瀏覽器

type Filter = "flagged" | "banned" | "jev" | "all";

function jevHits(s: SentenceResult): [JevKey, number][] {
  return (Object.entries(s.jev) as [JevKey, number][]).filter(([, v]) => v >= JEV_THRESHOLD).sort((a, b) => b[1] - a[1]);
}

export default function ComplianceCheckPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("general");
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [extraBanned, setExtraBanned] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [groups, setGroups] = useState<string[]>([]); // 勾選的產品分組
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<Filter>("flagged");

  useEffect(() => {
    fetch("/api/compliance-check")
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setError("讀取客戶規則失敗"));
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

  // 換客戶時產品分組清空，讓使用者自己勾這篇寫的是哪個產品
  useEffect(() => {
    setGroups([]);
  }, [clientId]);
  const needGroup = !!client && client.groups.length > 0 && groups.length === 0;

  const run = async () => {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          groups,
          extraBanned,
          ...(inputMode === "url" ? { url } : { text }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "檢查失敗");
      setReport(data);
      setFilter("flagged");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    if (!report) return null;
    const banned = report.sentences.filter((s) => s.banned.length > 0).length;
    const jev = report.sentences.filter((s) => jevHits(s).length > 0).length;
    const flagged = report.sentences.filter((s) => s.banned.length > 0 || jevHits(s).length > 0).length;
    return { banned, jev, flagged };
  }, [report]);

  const visible = useMemo(() => {
    if (!report) return [];
    return report.sentences.filter((s) => {
      if (filter === "all") return true;
      if (filter === "banned") return s.banned.length > 0;
      if (filter === "jev") return jevHits(s).length > 0;
      return s.banned.length > 0 || jevHits(s).length > 0;
    });
  }, [report, filter]);

  const canRun = !loading && !needGroup && (inputMode === "url" ? url.trim() : text.trim());

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">文案法規檢查</h1>
        <p className="text-sm text-gray-500 mt-1">
          逐句檢查客戶禁詞，再用 Jev 判斷「沒用禁詞、但意思在宣稱療效或招攬」的句子。結果是高風險提示，最後仍要人確認。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        {/* 客戶規則 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">客戶規則</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
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

        {/* 產品分組：禁詞依產品分的客戶，只套用這篇文章相關的產品 */}
        {client && client.groups.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              這篇寫的是哪個產品？ <span className="text-xs font-normal text-gray-400">只套用勾選產品的禁詞</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {client.groups.map((g) => (
                <label key={g} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={groups.includes(g)}
                    onChange={(e) => setGroups((prev) => (e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)))}
                  />
                  {g}
                </label>
              ))}
            </div>
          </div>
        )}

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
        {needGroup && <p className="text-xs text-gray-400">先勾選這篇寫的是哪個產品</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {report && counts && (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-gray-500">
            {report.title && <span className="font-medium text-gray-800">{report.title}．</span>}
            {report.client}．共 {report.sentenceCount} 句．Jev 花費 ${report.cost.toFixed(4)}
            {report.jevFailed > 0 && <span className="text-red-500">．{report.jevFailed} 句 Jev 判斷失敗</span>}
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

          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["flagged", `有問題 ${counts.flagged}`],
                ["banned", `禁詞 ${counts.banned}`],
                ["jev", `Jev 判斷 ${counts.jev}`],
                ["all", `全部 ${report.sentenceCount}`],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-sm px-3 py-1 rounded-full border ${
                  filter === f ? "bg-gray-900 text-white border-gray-900" : "text-gray-500 border-gray-300 hover:border-gray-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {visible.length === 0 && <p className="p-4 text-sm text-gray-400">沒有符合的句子</p>}
            {visible.map((s, i) => (
              <div key={i} className="p-4">
                <p className="text-sm text-gray-800 leading-relaxed">{s.text}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.banned.map((b) => (
                    <span key={b.word} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5">
                      禁詞「{b.word}」{b.replace && ` → 改「${b.replace}」`}
                      {b.note && !b.replace && `（${b.note}）`}
                    </span>
                  ))}
                  {jevHits(s).map(([k, v]) => (
                    <span key={k} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                      {JEV_LABELS[k]} {Math.round(v * 100)}%
                    </span>
                  ))}
                  {s.jevError && <span className="text-xs text-gray-400">Jev 判斷失敗</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
