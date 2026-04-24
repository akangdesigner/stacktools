'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
  keywords: string;
  persona: string;
}

export default function AiEditorListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<AiEditorClient[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSocialAccount, setNewSocialAccount] = useState('');
  const [newLineUid, setNewLineUid] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newPersona, setNewPersona] = useState('');
  const [creating, setCreating] = useState(false);

  function loadClients() {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((data: AiEditorClient[]) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadClients(); }, []);

  async function handleCreate() {
    if (!newName.trim() || !newSiteUrl.trim()) return;
    setCreating(true);
    const res = await fetch('/api/ai-editor/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), site_url: newSiteUrl.trim(), social_account: newSocialAccount.trim(), line_uid: newLineUid.trim(), keywords: newKeywords.trim(), persona: newPersona.trim() }),
    });
    const data = await res.json() as AiEditorClient;
    setCreating(false);
    setShowForm(false);
    setNewName(''); setNewSiteUrl(''); setNewSocialAccount(''); setNewLineUid(''); setNewKeywords(''); setNewPersona('');
    loadClients();
    if (data.id) router.push(`/ai-editor/${data.id}`);
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI 小編</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">開發中</span>
          <button
            onClick={() => setShowForm(v => !v)}
            className="ml-auto px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
          >
            + 新增客戶
          </button>
        </div>
        <p className="text-sm text-gray-500">自動偵測官網新文章，產生 AI 圖文草稿，透過 LINE 審核後自動上架社群。</p>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 max-w-md">
          <p className="text-sm font-semibold text-gray-800">新增客戶</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="客戶名稱 *" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <input value={newSiteUrl} onChange={e => setNewSiteUrl(e.target.value)} placeholder="文章列表網址 * (https://example.com/blog/)" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <textarea value={newSocialAccount} onChange={e => setNewSocialAccount(e.target.value)} rows={2} placeholder={`IG: @帳號\nFB: 粉專名稱`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <input value={newLineUid} onChange={e => setNewLineUid(e.target.value)} placeholder="LINE UID（選填）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="產業關鍵字（逗號分隔，例：植牙, 牙齒美白）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <textarea value={newPersona} onChange={e => setNewPersona(e.target.value)} rows={3} placeholder={`小編人設（例：溫暖親切的醫美診所小編，說話口吻輕鬆但專業，不用過度使用表情符號）`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName.trim() || !newSiteUrl.trim()} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
              {creating ? '建立中…' : '建立'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">載入中…</p>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">尚無客戶，點擊「新增客戶」或透過 LINE 機器人建立。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => router.push(`/ai-editor/${c.id}`)}
              className="text-left p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-400 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-gray-900 text-base leading-snug">{c.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-gray-300 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0 w-14">網址</span>
                  <span className="text-gray-600 truncate font-mono">{c.site_url}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0 w-14">社群</span>
                  {c.social_account
                    ? <span className="text-gray-600 truncate whitespace-pre">{c.social_account.split('\n')[0]}</span>
                    : <span className="text-gray-300">未設定</span>
                  }
                </div>
                <div className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0 w-14">LINE ID</span>
                  {c.line_uid
                    ? <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded leading-none">{c.line_uid}</span>
                    : <span className="text-gray-300">未設定</span>
                  }
                </div>
                <div className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0 w-14">關鍵字</span>
                  {c.keywords
                    ? <span className="text-gray-600 truncate">{c.keywords}</span>
                    : <span className="text-gray-300">未設定</span>
                  }
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
