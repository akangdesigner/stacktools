"use client";

import { useState } from "react";
import { useEffect } from "react";

interface FormData {
  title: string;
  keywords: string;
  searchTerm: string;
  requiredBrand: string;
  introLink: string;
}

export default function RecommendationPage() {
  const emptyForm: FormData = {
    title: "",
    keywords: "",
    searchTerm: "",
    requiredBrand: "",
    introLink: "",
  };

  const [form, setForm] = useState<FormData>({
    ...emptyForm,
  });
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [jobId, setJobId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [dots, setDots] = useState(".");

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleReset() {
    setForm({ ...emptyForm });
    setError("");
    setLetter("");
    setSuccess(false);
    setJobId("");
    setStatusMessage("");
    setIsProcessing(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setLetter("");
    setSuccess(false);
    setJobId("");
    setStatusMessage("");
    setIsProcessing(false);

    try {
      const res = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發生錯誤");
      setLetter(data.letter ?? "");
      setJobId(data.jobId ?? "");
      setStatusMessage(data.letter ?? "需求已送出，文章生成中");
      setIsProcessing(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isProcessing) { setDots("."); return; }
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(id);
  }, [isProcessing]);

  useEffect(() => {
    if (!jobId || !isProcessing) return;

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/recommendation/status?jobId=${encodeURIComponent(jobId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.message === "string") {
          setStatusMessage(data.message);
        }
        if (data?.status === "completed") {
          setIsProcessing(false);
          setSuccess(true);
          setLetter(data.message || "文章已生成完成，請前往 WordPress 後台查看。");
        } else if (data?.status === "failed") {
          setIsProcessing(false);
          setSuccess(false);
          setError(data.message || "文章生成失敗，請稍後重試。");
        }
      } catch {
        // Ignore transient polling errors.
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [jobId, isProcessing]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">推薦文生成器</h1>
        <p className="text-gray-500 mt-1 text-sm">填入主題與條件，AI 自動生成推薦型文章</p>
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
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "生成中…" : "生成推薦文章"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              清空表單
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

        {/* 結果 */}
        <div className="flex-1">
          {isProcessing ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">生成文章中</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                {statusMessage || "需求已送出，等待 n8n 完成生成後回傳通知。"}{dots}
              </p>
              <p className="text-xs text-gray-400">預估完成時間：3～5 分鐘</p>
            </div>
          ) : success ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">生成完成</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                n8n 已通知生成完成，請點擊下方連結前往 WordPress 查看文章。
              </p>
              <a
                href="https://beauty-win.com/wp-admin/edit.php"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                前往 WordPress 文章列表
              </a>
              {letter && <p className="text-xs text-gray-400">{letter}</p>}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center gap-3 min-h-64">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">✉️</div>
              <p className="text-sm text-gray-400">填寫左側資訊後<br />點擊生成按鈕</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
