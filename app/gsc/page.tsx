'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface GscClient {
  id: number;
  name: string;
  site_url: string;
  sheet_id: string;
  sheet_tab: string;
  article_sheet_id: string;
  article_sheet_tab: string;
  auto_update: number;
  keywords: { id: number; keyword: string; label: string }[];
  article_pages: { id: number; title: string; url: string }[];
}

export default function GscListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<GscClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch('/api/gsc/clients')
      .then(r => r.json())
      .then((data: GscClient[]) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/gsc/status').then(r => r.json())
      .then((d: { authorized: boolean; email?: string }) => { setAuthorized(d.authorized); setAuthEmail(d.email ?? null); })
      .finally(() => setAuthChecked(true));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/gsc/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, site_url: siteUrl }),
      });
      const data = await res.json() as GscClient & { error?: string };
      if (!res.ok) { setError(data.error ?? '建立失敗'); return; }
      router.push(`/gsc/${data.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GSC 關鍵字排名</h1>
          <p className="mt-1 text-sm text-gray-500">管理各客戶的追蹤關鍵字，查詢本週與上週的排名變化。</p>
          <p className="mt-0.5 text-xs text-gray-400">每週一 10:00 自動更新數據</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError(''); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新增客戶
        </button>
      </div>

      {!authChecked && <p className="text-sm text-gray-400">檢查授權狀態…</p>}
      {authChecked && !authorized && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 max-w-md">
          <p className="text-sm text-gray-700 font-medium">尚未連結 Google 帳號</p>
          <a href="/api/gsc/auth" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/></svg>
            連結 Google 帳號
          </a>
        </div>
      )}
      {authChecked && authorized && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 flex items-center gap-2 max-w-md">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          <p className="text-sm text-emerald-700">Google 帳號已連結{authEmail ? `：${authEmail}` : ''}</p>
          <a href="/api/gsc/auth" className="ml-auto text-xs text-emerald-600 hover:underline">重新授權</a>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4 max-w-md">
          <p className="text-sm font-medium text-gray-700">建立新客戶</p>
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">客戶名稱（必填）</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：未來美"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">GSC 站台網址（必填）</label>
            <input
              type="url"
              required
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://www.example.com/"
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

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">還沒有客戶，點右上角「新增客戶」開始。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/gsc/${c.id}`)}
              className="text-left p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-400 transition-all space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 leading-snug">{c.name}</span>
                  {!c.sheet_id && <span className="text-xs text-red-500 font-medium">未設定關鍵字 Sheet</span>}
                  {!c.article_sheet_id && <span className="text-xs text-red-500 font-medium">未設定文章 Sheet</span>}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-300 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <p className="text-xs text-gray-400">{c.site_url}</p>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  {c.keywords.length === 0 ? '目前未追蹤關鍵字' : `追蹤關鍵字：${c.keywords.length} 個`}
                </p>
                <p className="text-xs text-gray-500">
                  {c.article_pages.length === 0 ? '目前未追蹤文章' : `追蹤文章：${c.article_pages.length} 篇`}
                </p>
                {c.auto_update === 1 && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    自動更新
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
