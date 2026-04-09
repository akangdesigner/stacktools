'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteArticleButton({ id }: { id: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    await fetch(`/api/articles/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1" onClick={e => e.preventDefault()}>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-700 font-medium"
        >
          {loading ? '刪除中…' : '確認刪除'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          取消
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={e => { e.preventDefault(); setConfirming(true); }}
      className="text-xs text-gray-300 hover:text-red-400 transition-colors"
      title="刪除文章"
    >
      ✕
    </button>
  );
}
