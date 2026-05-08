'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Client {
  id: number;
  name: string;
  word_url: string;
  gdrive_url: string;
  persona: string;
  job_status: string;
  job_updated: string;
}

export default function BlogGenPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    const res = await fetch('/api/blog-gen/clients');
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/blog-gen/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const client = await res.json();
      setNewName('');
      setShowForm(false);
      router.push(`/blog-gen/${client.id}`);
    }
    setCreating(false);
  }

  function statusBadge(status: string) {
    if (status === 'completed') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已完成</span>;
    if (status === 'processing') return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">生成中</span>;
    if (status === 'failed') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">失敗</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">尚未生成</span>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">部落格文章生成器</h1>
          <p className="text-sm text-gray-500 mt-1">以客戶為單位，從 Word 文件生成並上架部落格文章</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新增客戶
        </button>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl px-8 py-7 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">新增客戶</h2>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="客戶名稱"
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {creating ? '建立中...' : '建立'}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewName(''); }}
                className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-gray-500">還沒有客戶，點擊右上角「新增客戶」開始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => router.push(`/blog-gen/${client.id}`)}
              className="text-left p-5 bg-white border border-gray-200 rounded-xl hover:border-gray-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="font-semibold text-gray-900 leading-tight">{client.name}</span>
                {statusBadge(client.job_status)}
              </div>
              <div className="space-y-1 text-xs text-gray-400">
                {client.word_url ? (
                  <p className="truncate">Word：{client.word_url}</p>
                ) : (
                  <p className="italic">尚未設定 Word 網址</p>
                )}
                {client.job_updated && (
                  <p>最後生成：{client.job_updated.replace('T', ' ').slice(0, 16)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
