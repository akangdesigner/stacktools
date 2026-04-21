'use client';

import { FormEvent, useState } from 'react';

type FeedbackCategory = '使用問題' | '工具建議' | '其他';

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: '使用問題', label: '使用問題' },
  { value: '工具建議', label: '工具建議' },
  { value: '其他', label: '其他' },
];

export default function FeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>('使用問題');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '提交失敗');

      setSuccess(true);
      setContent('');
      setCategory('使用問題');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">工具箱回饋</h1>
        <p className="text-gray-500 mt-1 text-sm">
          提交您遇到的使用疑惑，或希望新增的工具功能，我們會整理後持續優化。
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">回饋種類</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            內容 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            maxLength={2000}
            required
            placeholder="請描述您的問題或想新增的功能細節..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? '提交中...' : '送出回饋'}
          </button>
          {success && <span className="text-sm text-emerald-600">已成功送出，感謝您的回饋！</span>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
