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

type Phase = "idle" | "researching" | "awaiting_confirm" | "generating" | "completed";

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
  const [outline, setOutline] = useState("");
  const [confirming, setConfirming] = useState(false);

  // 完成後的 WordPress 連結
  const [wpEditLink, setWpEditLink] = useState("");
  const [wpLink, setWpLink] = useState("");

  const isWaiting = phase === "researching" || phase === "generating";

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
    setOutline("");
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
    setOutline("");
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
        body: JSON.stringify({ jobId, brands, outline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setStatusMessage("文章生成中（約 3～5 分鐘）");
      setPhase("generating");
    } catch (err) {
      setError(String(err));
    } finally {
      setConfirming(false);
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
          setOutline(typeof data?.data?.outline === "string" ? data.data.outline : "");
          setPhase("awaiting_confirm");
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
  }, [jobId, isWaiting]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">推薦文生成器</h1>
        <p className="text-gray-500 mt-1 text-sm">
          填入主題與條件 → 確認品牌與大綱 → AI 生成推薦型文章
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
              <p className="text-xs text-gray-400">預估完成時間：1～2 分鐘</p>
            </div>
          ) : phase === "awaiting_confirm" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">第二階段：確認品牌與大綱</h2>

              <div className="space-y-2">
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

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  文章大綱（可直接編輯）
                </label>
                <textarea
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  rows={12}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmGenerate}
                disabled={confirming}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? "送出中…" : "確認，開始生成文章"}
              </button>
            </div>
          ) : phase === "generating" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">第三階段：生成文章中</h2>
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
