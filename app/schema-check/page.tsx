"use client";

import { useState } from "react";
import { formFieldsFor, buildFormDefaults, mergeFormIntoNode, emptyNode } from "@/lib/schema-templates";

// 單一 JSON-LD 節點的檢查結果（對應後端 /api/schema-check 回傳的 evals）
interface DisplayField {
  label: string;
  value: string;
}
type TrackedLabel = "LocalBusiness" | "Organization" | "Product";
interface NodeEval {
  node: Record<string, unknown>;
  types: string[];
  label: "" | TrackedLabel | "Article";
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
  Organization: "組織/品牌",
  Product: "商品",
  Article: "文章",
  "": "",
};

type Mode = "pick" | "check" | "generate";

// 單一 JSON-LD 節點卡片：好讀欄位清單 + 匯入生成工具的捷徑 + 收合的原始 JSON
function NodeCard({
  ev,
  copied,
  onCopy,
  onImport,
}: {
  ev: NodeEval;
  copied: boolean;
  onCopy: () => void;
  onImport: (ev: NodeEval & { label: TrackedLabel }) => void;
}) {
  const canImport = ev.label === "LocalBusiness" || ev.label === "Organization" || ev.label === "Product";
  const templateFields = canImport ? formFieldsFor(ev.label) : null;
  const templateValues = templateFields ? buildFormDefaults(ev.node, ev.label) : null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center flex-wrap justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">{LABEL_TEXT[ev.label]}</span>
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

      {templateFields && templateValues ? (
        // 在地商家／組織品牌有固定欄位表可對照：跟生成工具用同一套欄位定義，逐項列出有值/未設定，才看得懂缺什麼
        <dl className="divide-y divide-gray-50">
          {templateFields.map((f) => {
            const v = templateValues[f.key] ?? "";
            const present = v.trim().length > 0;
            return (
              <div key={f.key} className="flex gap-3 px-4 py-2 text-sm">
                <dt className="w-28 shrink-0 text-gray-400">{f.label.replace(/（.*?）/, "")}</dt>
                {present ? (
                  <dd className="text-gray-700 break-all whitespace-pre-line">{v}</dd>
                ) : (
                  <dd className="text-amber-500 text-xs">未設定</dd>
                )}
              </div>
            );
          })}
        </dl>
      ) : ev.fields.length > 0 ? (
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

      {canImport && (
        <button
          type="button"
          onClick={() => onImport(ev as NodeEval & { label: TrackedLabel })}
          className="w-full text-left px-4 py-2 text-xs font-medium text-orange-600 hover:text-orange-700 border-t border-gray-100"
        >
          匯入到生成工具補完 →
        </button>
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

// 檢索模式：貼網址，抓真實部署的 JSON-LD，核對關鍵欄位
function CheckView({ onImport }: { onImport: (ev: NodeEval & { label: TrackedLabel }) => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleCheck(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch("/api/schema-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "抓取失敗");
      setResults(data.results as PageResult[]);
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
    <div>
      <p className="text-sm text-gray-500 mb-4">
        貼網址，查首頁的 Schema——在地商家/組織品牌 schema 幾乎都是全站共用同一份，查首頁就等於查全站。會實際跑一次瀏覽器渲染再讀結果，連 SHOPLINE 這類用前端 JS 動態插入 schema 的平台也抓得到，大概要 10~15 秒。
      </p>

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

      {results &&
        (() => {
          // 同一份 Organization/LocalBusiness schema 常是全站共用（WordPress/Yoast 這類 CMS 每頁都塞一樣的），
          // 首頁跟自動找到的相關頁抓到的其實是同一筆資料，去重只顯示一次，避免重複的卡片洗版
          type Entry = { ev: NodeEval; pages: { url: string; source: string }[] };
          const map = new Map<string, Entry>();
          for (const r of results) {
            for (const ev of r.evals) {
              if (ev.label === "") continue;
              const id = ev.node["@id"];
              const dedupeKey = typeof id === "string" && id ? id : JSON.stringify(ev.node);
              const existing = map.get(dedupeKey);
              if (existing) existing.pages.push({ url: r.url, source: r.source });
              else map.set(dedupeKey, { ev, pages: [{ url: r.url, source: r.source }] });
            }
          }
          const deduped = [...map.values()];

          // LocalBusiness/Organization 代表「品牌本體只有一份」——同一首頁若出現好幾個這種節點，
          // 通常是平台預設值跟商家自己填的資料疊在一起（如 SHOPLINE 站常見），Google 只會採信其中一個。
          // 只挑欄位最完整的一份顯示；名稱不一致才提示衝突，名稱一致（純粹是同一份資料重複宣告）就不用講
          type DisplayEntry = Entry & { conflictNames?: string[] };
          const IDENTITY_LABELS = new Set(["LocalBusiness", "Organization"]);
          const byLabel = new Map<string, Entry[]>();
          const entries: DisplayEntry[] = [];
          for (const e of deduped) {
            if (!IDENTITY_LABELS.has(e.ev.label)) { entries.push(e); continue; }
            const list = byLabel.get(e.ev.label) ?? [];
            list.push(e);
            byLabel.set(e.ev.label, list);
          }
          for (const group of byLabel.values()) {
            if (group.length === 1) { entries.push(group[0]); continue; }
            const primary = [...group].sort((a, b) => a.ev.missing.length - b.ev.missing.length || b.ev.fields.length - a.ev.fields.length)[0];
            const names = [...new Set(group.map((g) => (typeof g.ev.node.name === "string" ? g.ev.node.name.trim() : "")).filter(Boolean))];
            entries.push(names.length > 1 ? { ...primary, conflictNames: names } : primary);
          }

          if (entries.length === 0) {
            return (
              <div className="mt-6 bg-gray-50 border border-gray-200 text-gray-500 text-sm rounded-lg px-4 py-3">
                沒有偵測到在地商家/組織品牌/商品/文章相關的 Schema。
              </div>
            );
          }

          return (
            <div className="mt-6 space-y-6">
              {entries.map((entry, i) => {
                const key = `${i}`;
                return (
                  <div key={key} className="space-y-1.5">
                    {entry.pages.length <= 3 ? (
                      <p className="text-xs text-gray-400">出現在：{entry.pages.map((p) => p.url).join("、")}</p>
                    ) : (
                      <details className="text-xs text-gray-400">
                        <summary className="cursor-pointer hover:text-gray-600">
                          出現在 {entry.pages.length} 個頁面（{entry.pages[0].url} 等，點開看清單）
                        </summary>
                        <ul className="mt-1 pl-4 list-disc space-y-0.5">
                          {entry.pages.map((p, j) => (
                            <li key={j} className="break-all">{p.url}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {entry.conflictNames && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        偵測到 {entry.conflictNames.length} 個同型別節點名稱不一致：{entry.conflictNames.join("、")}，已顯示欄位最完整的一份，建議請客戶統一成單一權威名稱。
                      </p>
                    )}
                    <NodeCard ev={entry.ev} copied={copiedKey === key} onCopy={() => handleCopy(key, entry.ev.node)} onImport={onImport} />
                  </div>
                );
              })}
            </div>
          );
        })()}
    </div>
  );
}

// 生成/補完模式：選型別、填表單，即時組出 JSON-LD；可從檢索結果匯入既有資料當起點
function GenerateView({
  label,
  setLabel,
  baseNode,
  setBaseNode,
  values,
  setValues,
}: {
  label: TrackedLabel;
  setLabel: (l: TrackedLabel) => void;
  baseNode: Record<string, unknown>;
  setBaseNode: (n: Record<string, unknown>) => void;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  const fields = formFieldsFor(label)!;
  const merged = mergeFormIntoNode(baseNode, label, values);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<"selfbuilt" | "wordpress">("selfbuilt");

  function switchLabel(l: TrackedLabel) {
    setLabel(l);
    setBaseNode(emptyNode(l));
    setValues({});
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(merged, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 複製失敗就略過 */
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">選型別、填欄位，右邊即時產生可直接複製貼回網站的 JSON-LD。也可以先去「檢索」查一個網址，找到現有節點後按「匯入到生成工具補完」，帶著既有資料回來這裡補。</p>

      <div className="flex gap-2 mb-4">
        {(["LocalBusiness", "Organization", "Product"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchLabel(l)}
            className={`text-sm font-medium rounded-lg px-4 py-2 border ${
              label === l ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-orange-300"
            }`}
          >
            {LABEL_TEXT[l]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              {f.multiline ? (
                <textarea
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              )}
            </div>
          ))}
        </div>

        <div>
          <button
            type="button"
            onClick={handleCopy}
            className="mb-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {copied ? "已複製 ✓" : "複製 JSON-LD"}
          </button>
          <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-[520px] overflow-y-auto">
            {`<script type="application/ld+json">\n${JSON.stringify(merged, null, 2)}\n</script>`}
          </pre>
        </div>
      </div>

      {label === "Organization" && (
        <div className="mt-6 bg-sky-50 border border-sky-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">帶去給工程師：怎麼把這些欄位補上網站</h3>
          <div className="flex gap-2 mb-4">
            {(
              [
                ["selfbuilt", "自架網站／其他 CMS"],
                ["wordpress", "WordPress"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlatform(key)}
                className={`text-sm font-medium rounded-lg px-4 py-2 border ${
                  platform === key ? "bg-sky-500 border-sky-500 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-sky-300"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {platform === "selfbuilt" ? (
            <ul className="text-sm text-gray-600 leading-relaxed space-y-2 list-disc pl-5">
              <li>把上面「複製 JSON-LD」那顆按鈕產生的整段，貼進網站頁面的 <code>&lt;head&gt;</code> 就好，不用寫 code。</li>
              <li className="text-gray-500">前提：頁面原本沒有別的 Organization JSON-LD。如果已經有一份，兩份會互相衝突，要先確認是取代還是合併。</li>
            </ul>
          ) : (
            <div className="space-y-4">
              <ul className="text-sm text-gray-600 leading-relaxed space-y-2 list-disc pl-5">
                <li>用我們自己開發的 Stack Schema 外掛直接輸出，不再依賴 Yoast SEO 補值。</li>
                <li>若網站原本就有裝 Yoast SEO，外掛啟用後會自動移除 Yoast 輸出的 Organization/Person 節點，避免重複衝突，Yoast 的其他功能（meta 標題描述、sitemap 等）不受影響，不用另外調整 Yoast 設定。</li>
              </ul>
              <a
                href="/downloads/stack-schema.zip"
                download
                className="inline-block bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                下載 Stack Schema 外掛（.zip）
              </a>
              <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-2 leading-relaxed">
                <li>後台「外掛」→「安裝外掛」→「上傳外掛」→ 選剛下載的 zip → 安裝並啟用</li>
                <li>左側選單「設定」→「Schema 設定」</li>
                <li>對照左邊表單填的欄位，填進「Organization（品牌）」；有實體店面才填「LocalBusiness（在地商家）」</li>
                <li>存檔即可，全站自動生效</li>
                <li>回這個工具的「檢索」模式重查一次網址，確認 Organization 節點多了對應欄位</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchemaCheckPage() {
  const [mode, setMode] = useState<Mode>("pick");
  const [genLabel, setGenLabel] = useState<TrackedLabel>("LocalBusiness");
  const [genBaseNode, setGenBaseNode] = useState<Record<string, unknown>>(() => emptyNode("LocalBusiness"));
  const [genValues, setGenValues] = useState<Record<string, string>>({});

  function handleImport(ev: NodeEval & { label: TrackedLabel }) {
    setGenLabel(ev.label);
    setGenBaseNode(ev.node);
    setGenValues(buildFormDefaults(ev.node, ev.label));
    setMode("generate");
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">Schema 檢查工具</h1>
        <p className="text-sm text-gray-500 mt-1">先選要「檢索」網站現有的結構化資料，還是直接「生成」補完。</p>
      </div>

      {mode === "pick" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <button
            type="button"
            onClick={() => setMode("check")}
            className="text-left p-5 rounded-xl border-2 bg-sky-50 border-sky-200 hover:border-sky-400 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center text-xl mb-3">🔍</div>
            <h3 className="font-semibold text-gray-900 mb-1">檢索現有 Schema</h3>
            <p className="text-sm text-gray-500 leading-relaxed">貼網址，抓真實部署的 JSON-LD，核對關鍵欄位有沒有缺。</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("generate")}
            className="text-left p-5 rounded-xl border-2 bg-violet-50 border-violet-200 hover:border-violet-400 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-xl mb-3">✨</div>
            <h3 className="font-semibold text-gray-900 mb-1">生成/補完 Schema</h3>
            <p className="text-sm text-gray-500 leading-relaxed">選型別填表單，即時產生 JSON-LD；也可以匯入檢索到的資料再補。</p>
          </button>
        </div>
      )}

      {mode !== "pick" && (
        <>
          <div className="flex gap-2 mb-6 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setMode("check")}
              className={`text-sm font-medium px-4 py-2 border-b-2 -mb-px ${
                mode === "check" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              🔍 檢索
            </button>
            <button
              type="button"
              onClick={() => setMode("generate")}
              className={`text-sm font-medium px-4 py-2 border-b-2 -mb-px ${
                mode === "generate" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              ✨ 生成/補完
            </button>
          </div>

          {mode === "check" && <CheckView onImport={handleImport} />}
          {mode === "generate" && (
            <GenerateView label={genLabel} setLabel={setGenLabel} baseNode={genBaseNode} setBaseNode={setGenBaseNode} values={genValues} setValues={setGenValues} />
          )}
        </>
      )}
    </div>
  );
}
