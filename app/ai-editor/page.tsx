'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
}

export default function AiEditorListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<AiEditorClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((data: AiEditorClient[]) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI 小編</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">開發中</span>
        </div>
        <p className="text-sm text-gray-500">自動偵測官網新文章，產生 AI 圖文草稿，透過 LINE 審核後自動上架社群。</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">尚無客戶，請透過 LINE 機器人建立。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/ai-editor/${c.id}`)}
              className="text-left p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-400 transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-gray-900 leading-snug">{c.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-300 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <p className="text-xs text-gray-400 truncate">{c.site_url}</p>
              {c.social_account && (
                <p className="text-xs text-gray-500 truncate">{c.social_account}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
