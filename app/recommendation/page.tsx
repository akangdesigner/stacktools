"use client";

import { useEffect, useState } from "react";

interface FormData {
  title: string;
  keywords: string;
  searchTerm: string;
  requiredBrand: string;
  introLink: string;
}

interface Brand {
  brand_name: string;
  official_url: string;
}

interface OutlineSection {
  id: string;
  h2: string;
  h3s: string[];
}

// 把 n8n 大綱生成器輸出的「前言 / 1. .../ 1.1. .../ 總結」編號格式拆成可逐項編輯的結構
// 保留原始編號前綴（不轉成 markdown），因為工作流3的 Switch 節點是靠編號規則分流
function parseOutlineText(text: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  let current: OutlineSection | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\d+\.\d+\.?/.test(line)) {
      if (current) current.h3s.push(line);
    } else {
      current = { id: crypto.randomUUID(), h2: line, h3s: [] };
      sections.push(current);
    }
  }
  return sections;
}

// 送回後端前照原編號格式重新組成（每行保留自己的編號前綴）
function serializeOutline(sections: OutlineSection[]): string {
  return sections
    .map((s) => s.h2 + (s.h3s.length ? "\n" + s.h3s.join("\n") : ""))
    .join("\n\n");
}

type Phase =
  | "idle"
  | "researching"
  | "awaiting_confirm"
  | "researching_details"
  | "awaiting_final_confirm"
  | "generating"
  | "completed";

interface BrandDetail {
  brand_name: string;
  brand_background: string;
  brand_positioning: string;
  media_coverage: string;
  awards_certifications: string;
  market_features: string;
  pros: string;
  cons: string;
  user_experience: string;
  discussion_points: string;
  repurchase_intent: string;
}

// 品牌卡片欄位模板：客觀基礎資訊區塊要列哪些欄位，交給 n8n 工作流3 動態產生對應 schema
const CARD_TEMPLATES: { value: string; label: string; hint: string }[] = [
  { value: "general", label: "通用", hint: "產品定位／主要特色／適用場景／官方特色，適合大多數品類" },
  { value: "supplement", label: "保健食品／美妝", hint: "核心成分／劑量／劑型／複方成分／包裝份量／產地" },
  { value: "electronics", label: "3C／家電", hint: "主要規格／核心功能／保固期限／隨附配件" },
  { value: "service", label: "服務類", hint: "服務定位／收費模式／主要特色／適用場景，適合代操／顧問／教育訓練等服務型品牌" },
];

export default function RecommendationPage() {
  const emptyForm: FormData = {
    title: "",
    keywords: "",
    searchTerm: "",
    requiredBrand: "",
    introLink: "",
  };

  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [dots, setDots] = useState(".");

  // 確認面板的可編輯資料
  const [brands, setBrands] = useState<Brand[]>([]);
  // 找品牌時搜到但沒進正式名單的備選（只有名稱、沒有網址，讓用戶自己判斷要不要換上）
  const [backupBrands, setBackupBrands] = useState<string[]>([]);
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [cardTemplate, setCardTemplate] = useState("general");
  const [confirming, setConfirming] = useState(false);
  // 第二階段拆兩步顯示：先確認品牌與網址，下一步才確認大綱，避免單一畫面塞太多東西
  const [confirmStep, setConfirmStep] = useState<"brands" | "outline">("brands");

  // 品牌深度研究結果（第三階段確認用）
  const [brandDetailsList, setBrandDetailsList] = useState<BrandDetail[]>([]);
  const [finalConfirming, setFinalConfirming] = useState(false);

  // 完成後的 WordPress 連結
  const [wpEditLink, setWpEditLink] = useState("");
  const [wpLink, setWpLink] = useState("");

  const isWaiting =
    phase === "researching" || phase === "researching_details" || phase === "generating";

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleReset() {
    setForm({ ...emptyForm });
    setError("");
    setJobId("");
    setPhase("idle");
    setStatusMessage("");
    setBrands([]);
    setBackupBrands([]);
    setOutlineSections([]);
    setConfirmTitle("");
    setTitleSuggestions([]);
    setWpEditLink("");
    setWpLink("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setJobId("");
    setPhase("idle");
    setStatusMessage("");
    setBrands([]);
    setBackupBrands([]);
    setOutlineSections([]);
    setConfirmTitle("");
    setTitleSuggestions([]);
    setWpEditLink("");
    setWpLink("");

    try {
      const res = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setJobId(data.jobId ?? "");
      setStatusMessage(data.message ?? "正在查詢品牌與生成大綱");
      setPhase("researching");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmGenerate() {
    if (!jobId) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/recommendation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          brands,
          outline: serializeOutline(outlineSections),
          title: confirmTitle,
          cardTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setStatusMessage("正在研究品牌細節（約 1～3 分鐘）");
      setPhase("researching_details");
    } catch (err) {
      setError(String(err));
    } finally {
      setConfirming(false);
    }
  }

  async function handleBackToConfirm() {
    if (!jobId) return;
    setError("");
    try {
      const res = await fetch("/api/recommendation/back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setConfirmStep("brands");
      setPhase("awaiting_confirm");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleConfirmFinalGenerate() {
    if (!jobId) return;
    setFinalConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/recommendation/generate-final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setStatusMessage("文章生成中（約 3～5 分鐘）");
      setPhase("generating");
    } catch (err) {
      setError(String(err));
    } finally {
      setFinalConfirming(false);
    }
  }

  function updateBrand(index: number, field: keyof Brand, value: string) {
    setBrands((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  }

  function removeBrand(index: number) {
    setBrands((prev) => prev.filter((_, i) => i !== index));
  }

  function addBrand() {
    setBrands((prev) => [...prev, { brand_name: "", official_url: "" }]);
  }

  // 把備選品牌加進正式名單（網址留空，用戶自己點驗證 icon 查完再貼），並從備選清單移除
  function applyBackupBrand(name: string) {
    setBrands((prev) => [...prev, { brand_name: name, official_url: "" }]);
    setBackupBrands((prev) => prev.filter((b) => b !== name));
  }

  function addH2Section() {
    setOutlineSections((prev) => [...prev, { id: crypto.randomUUID(), h2: "", h3s: [] }]);
  }

  function removeH2Section(index: number) {
    setOutlineSections((prev) => prev.filter((_, i) => i !== index));
  }

  function updateH2(index: number, value: string) {
    setOutlineSections((prev) => prev.map((s, i) => (i === index ? { ...s, h2: value } : s)));
  }

  function addH3(sectionIndex: number) {
    setOutlineSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, h3s: [...s.h3s, ""] } : s))
    );
  }

  function updateH3(sectionIndex: number, h3Index: number, value: string) {
    setOutlineSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, h3s: s.h3s.map((h, j) => (j === h3Index ? value : h)) }
          : s
      )
    );
  }

  function removeH3(sectionIndex: number, h3Index: number) {
    setOutlineSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex ? { ...s, h3s: s.h3s.filter((_, j) => j !== h3Index) } : s
      )
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isWaiting) { setDots("."); return; }
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(id);
  }, [isWaiting]);

  useEffect(() => {
    if (!jobId || !isWaiting) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/recommendation/status?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.message === "string") {
          setStatusMessage(data.message);
        }
        if (data?.status === "awaiting_confirm") {
          setBrands(Array.isArray(data?.data?.brands) ? data.data.brands : []);
          setBackupBrands(Array.isArray(data?.data?.backupBrands) ? data.data.backupBrands : []);
          setOutlineSections(
            parseOutlineText(typeof data?.data?.outline === "string" ? data.data.outline : "")
          );
          setTitleSuggestions(
            Array.isArray(data?.data?.titleSuggestions) ? data.data.titleSuggestions : []
          );
          setConfirmTitle(form.title);
          setConfirmStep("brands");
          setPhase("awaiting_confirm");
        } else if (data?.status === "researching_details") {
          setPhase("researching_details");
        } else if (data?.status === "awaiting_final_confirm") {
          setBrandDetailsList(
            Array.isArray(data?.data?.brandDetails) ? data.data.brandDetails : []
          );
          setPhase("awaiting_final_confirm");
        } else if (data?.status === "generating") {
          setPhase("generating");
        } else if (data?.status === "completed") {
          setWpEditLink(data?.data?.wpEditLink ?? "");
          setWpLink(data?.data?.wpLink ?? "");
          setPhase("completed");
        } else if (data?.status === "failed") {
          setPhase("idle");
          setError(data.message || "生成失敗，請稍後重試。");
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 3000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.title 只在轉入 awaiting_confirm 當下讀取一次，不用追蹤變化
  }, [jobId, isWaiting]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">推薦文生成器</h1>
        <p className="text-gray-500 mt-1 text-sm">
          填入主題與條件 → 確認品牌與大綱 → 確認品牌深度研究 → AI 生成推薦型文章
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* 表單 */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">文章設定</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                標題 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="例：想找短影音公司合作怎麼選？最新推薦 10 家公司 & 案例分享"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                關鍵字 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.keywords}
                onChange={(e) => handleChange("keywords", e.target.value)}
                placeholder="例：短影音公司,短影音代操,短影音行銷"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                搜尋項目 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.searchTerm}
                onChange={(e) => handleChange("searchTerm", e.target.value)}
                placeholder="例：短影音行銷公司"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                必須包含品牌
              </label>
              <input
                type="text"
                value={form.requiredBrand}
                onChange={(e) => handleChange("requiredBrand", e.target.value)}
                placeholder="例：穿透行銷"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                前言連結
              </label>
              <input
                type="url"
                value={form.introLink}
                onChange={(e) => handleChange("introLink", e.target.value)}
                placeholder="https://example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || isWaiting || phase === "awaiting_confirm"}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "送出中…" : "查詢品牌與大綱"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              全部重來
            </button>
          </div>
          {loading && (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-3">
              正在送出需求...
            </p>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">{error}</p>
          )}
        </form>

        {/* 結果 / 確認面板 */}
        <div className="flex-1">
          {phase === "researching" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">第一階段：研究中</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {statusMessage || "正在查詢品牌與生成大綱"}{dots}
              </p>
              <p className="text-xs text-gray-400">預估完成時間：1～3 分鐘（品牌查詢與大綱生成）</p>
            </div>
          ) : phase === "awaiting_confirm" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">
                第二階段：確認{confirmStep === "brands" ? "品牌與網址" : "文章大綱"}
              </h2>

              {confirmStep === "brands" ? (
              <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">
                  標題（可編輯，或點下方 AI 建議套用）
                </label>
                <input
                  type="text"
                  value={confirmTitle}
                  onChange={(e) => setConfirmTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                {titleSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {titleSuggestions.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setConfirmTitle(t)}
                        className="text-xs px-2 py-1 rounded-full border border-orange-200 text-orange-600 hover:bg-orange-50 text-left"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-4 items-start">
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">
                    品牌清單（可修改、刪除、新增）
                  </label>
                  <button
                    type="button"
                    onClick={addBrand}
                    className="text-xs font-semibold text-orange-500 hover:text-orange-600"
                  >
                    ＋ 新增品牌
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {brands.map((brand, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={brand.brand_name}
                        onChange={(e) => updateBrand(i, "brand_name", e.target.value)}
                        placeholder="品牌名稱"
                        className="w-2/5 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <input
                        type="text"
                        value={brand.official_url}
                        onChange={(e) => updateBrand(i, "official_url", e.target.value)}
                        placeholder="官方網址"
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      {brand.official_url && (
                        <a
                          href={brand.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="開新分頁確認網址是否正確"
                          className="text-gray-400 hover:text-orange-500 px-1"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                          </svg>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeBrand(i)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                        title="刪除此品牌"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {brands.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">
                      沒有品牌，請點「＋ 新增品牌」手動加入
                    </p>
                  )}
                </div>
              </div>

              {backupBrands.length > 0 && (
                <div className="w-40 shrink-0 space-y-2">
                  <label className="text-xs font-medium text-gray-600">
                    備選品牌（點一下換上）
                  </label>
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                    {backupBrands.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => applyBackupBrand(name)}
                        title="加入品牌清單（網址留空，請自己確認後補上）"
                        className="text-xs text-left px-2 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-orange-400 hover:text-orange-600 transition-colors"
                      >
                        ＋ {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">
                  品牌卡片欄位（決定「客觀基礎資訊」要列哪些欄位）
                </label>
                <select
                  value={cardTemplate}
                  onChange={(e) => setCardTemplate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  {CARD_TEMPLATES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">
                  {CARD_TEMPLATES.find((t) => t.value === cardTemplate)?.hint}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setConfirmStep("outline")}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                下一步：確認大綱
              </button>
              </>
              ) : (
              <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">
                    文章大綱（可新增、刪除、編輯，請保留編號格式）
                  </label>
                  <button
                    type="button"
                    onClick={addH2Section}
                    className="text-xs font-semibold text-orange-500 hover:text-orange-600"
                  >
                    ＋ 新增大章
                  </button>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {outlineSections.map((section, sIdx) => (
                    <div
                      key={section.id}
                      className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50"
                    >
                      <div className="flex gap-2 items-center">
                        <span className="text-xs font-semibold text-gray-400 shrink-0">大章</span>
                        <input
                          type="text"
                          value={section.h2}
                          onChange={(e) => updateH2(sIdx, e.target.value)}
                          placeholder="例：1. XXX的判斷依據（或「前言」「總結」）"
                          className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <button
                          type="button"
                          onClick={() => removeH2Section(sIdx)}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                          title="刪除此大章"
                        >
                          ×
                        </button>
                      </div>
                      <div className="pl-6 space-y-1.5">
                        {section.h3s.map((h3, hIdx) => (
                          <div key={hIdx} className="flex gap-2 items-center">
                            <span className="text-xs text-gray-400 shrink-0">子項</span>
                            <input
                              type="text"
                              value={h3}
                              onChange={(e) => updateH3(sIdx, hIdx, e.target.value)}
                              placeholder="例：1.1. 子項標題"
                              className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                            />
                            <button
                              type="button"
                              onClick={() => removeH3(sIdx, hIdx)}
                              className="text-gray-300 hover:text-red-400 text-base leading-none px-1"
                              title="刪除此子項"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addH3(sIdx)}
                          className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                        >
                          ＋ 新增子項
                        </button>
                      </div>
                    </div>
                  ))}
                  {outlineSections.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">
                      沒有大綱，請點「＋ 新增大章」手動加入
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmStep("brands")}
                  className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGenerate}
                  disabled={confirming}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirming ? "送出中…" : "確認，開始生成文章"}
                </button>
              </div>
              </>
              )}
            </div>
          ) : phase === "researching_details" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">第三階段：品牌深度研究中</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {statusMessage || "正在研究品牌細節"}{dots}
              </p>
              <p className="text-xs text-gray-400">
                預估完成時間：1～3 分鐘，跑完會請你確認研究結果再生成文章
              </p>
            </div>
          ) : phase === "awaiting_final_confirm" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">第四階段：確認品牌深度研究結果</h2>
              <p className="text-xs text-gray-400">
                看過沒問題再按確認，下一步是最花時間、最花錢的完整生成
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {brandDetailsList.map((b, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-1.5 bg-gray-50">
                    <p className="text-sm font-semibold text-gray-800">{b.brand_name}</p>
                    <p className="text-xs text-gray-600"><span className="font-medium">品牌背景：</span>{b.brand_background}</p>
                    <p className="text-xs text-gray-600"><span className="font-medium">品牌定位：</span>{b.brand_positioning}</p>
                    <p className="text-xs text-gray-600"><span className="font-medium">媒體報導：</span>{b.media_coverage}</p>
                    <p className="text-xs text-gray-600"><span className="font-medium">獎項認證：</span>{b.awards_certifications}</p>
                    <p className="text-xs text-gray-600"><span className="font-medium">市場亮點：</span>{b.market_features}</p>
                    {(b.pros || b.cons || b.user_experience) && (
                      <>
                        <p className="text-xs text-gray-600"><span className="font-medium">網友優點：</span>{b.pros || "（無資料）"}</p>
                        <p className="text-xs text-gray-600"><span className="font-medium">網友缺點：</span>{b.cons || "（無資料）"}</p>
                        <p className="text-xs text-gray-600"><span className="font-medium">使用感受：</span>{b.user_experience || "（無資料）"}</p>
                      </>
                    )}
                  </div>
                ))}
                {brandDetailsList.length === 0 && (
                  <p className="text-xs text-gray-400 py-2">沒有品牌深度研究資料</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBackToConfirm}
                  disabled={finalConfirming}
                  className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一步，修改品牌/大綱
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFinalGenerate}
                  disabled={finalConfirming}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {finalConfirming ? "送出中…" : "確認，開始生成文章"}
                </button>
              </div>
            </div>
          ) : phase === "generating" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">第五階段：生成文章中</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {statusMessage || "文章生成中"}{dots}
              </p>
              <p className="text-xs text-gray-400">預估完成時間：3～5 分鐘</p>
            </div>
          ) : phase === "completed" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">生成完成</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                文章已建立為 WordPress 草稿，點擊下方連結前往編輯。
              </p>
              <div className="flex gap-2 flex-wrap">
                {wpEditLink && (
                  <a
                    href={wpEditLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    編輯草稿
                  </a>
                )}
                {wpLink && (
                  <a
                    href={wpLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    預覽文章
                  </a>
                )}
                {!wpEditLink && !wpLink && (
                  <a
                    href="https://recommend.dg166.com/wp-admin/edit.php"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    前往 WordPress 文章列表
                  </a>
                )}
              </div>
              {statusMessage && <p className="text-xs text-gray-400">{statusMessage}</p>}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center gap-3 min-h-64">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">✉️</div>
              <p className="text-sm text-gray-400">填寫左側資訊後<br />點擊查詢按鈕</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
