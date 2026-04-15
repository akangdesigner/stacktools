'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ClientSummary {
  id: string;
  name: string;
  slack_id: string | null;
  created_at: string;
  url_count: number;
}

export default function SocialListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slackId, setSlackId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/social-clients')
      .then((r) => r.json())
      .then((data) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/social-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slackId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '建立失敗'); return; }
      router.push(`/social/${data.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">社群監控客戶</h1>
          <p className="mt-1 text-sm text-gray-500">管理各客戶的社群帳號追蹤與 Webhook 觸發。</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setError(''); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新增客戶
        </button>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
          <p className="text-sm font-medium text-gray-700">建立新客戶</p>
          <div className="space-y-1">
            <label className="block text-xs text-gray-500" htmlFor="name">客戶名稱（必填）</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：某某品牌"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-gray-500" htmlFor="slackId">Slack 頻道 ID</label>
            <input
              id="slackId"
              type="text"
              value={slackId}
              onChange={(e) => setSlackId(e.target.value)}
              placeholder="C0XXXXXXXXX"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {creating ? '建立中…' : '建立並進入'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 客戶卡片 */}
      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">還沒有客戶，點右上角「新增客戶」開始。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/social/${c.id}`)}
              className="text-left p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-400 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-gray-900 leading-snug">{c.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-300 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div className="space-y-1 text-xs text-gray-500">
                {c.slack_id && <p>Slack：{c.slack_id}</p>}
                <p>追蹤 URL：{c.url_count} 筆</p>
                <p>建立：{c.created_at}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
