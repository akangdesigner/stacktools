'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteMeetingButton({ id }: { id: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await fetch('/api/dev/meetings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    router.push('/dev/meetings');
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">確定刪除？</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {deleting ? '刪除中…' : '確定'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="px-3 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
    >
      刪除會議
    </button>
  );
}
