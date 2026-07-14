'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  social_account: string;  // 舊格式備份，新資料一律讀寫下面 6 個真欄位
  fb_user: string;
  fb_pass: string;
  th_user: string;
  th_pass: string;
  ig_user: string;
  ig_pass: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
}

// 卡片列表用的社群帳號預覽：優先顯示真欄位，沒有才退回舊格式原文第一行
function accountPreview(c: AiEditorClient): string {
  const parts: string[] = [];
  if (c.fb_user) parts.push(`FB: ${c.fb_user}`);
  if (c.th_user) parts.push(`Threads: ${c.th_user}`);
  if (c.ig_user) parts.push(`IG: ${c.ig_user}`);
  if (parts.length) return parts.join(' / ');
  return c.social_account ? c.social_account.split('\n')[0] : '';
}

export default function AiEditorListPage() {
  const router = useRouter();
  const [clients, setClients] = useState<AiEditorClient[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFbUser, setNewFbUser] = useState('');
  const [newFbPass, setNewFbPass] = useState('');
  const [newThUser, setNewThUser] = useState('');
  const [newThPass, setNewThPass] = useState('');
  const [newIgUser, setNewIgUser] = useState('');
  const [newIgPass, setNewIgPass] = useState('');
  const [newLineUid, setNewLineUid] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newPersona, setNewPersona] = useState('');
  const [newClientInfo, setNewClientInfo] = useState('');
  const [creating, setCreating] = useState(false);

  function loadClients() {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((data: AiEditorClient[]) => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadClients(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/ai-editor/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        fb_user: newFbUser.trim(), fb_pass: newFbPass.trim(),
        th_user: newThUser.trim(), th_pass: newThPass.trim(),
        ig_user: newIgUser.trim(), ig_pass: newIgPass.trim(),
        line_uid: newLineUid.trim(), keywords: newKeywords.trim(), persona: newPersona.trim(), client_info: newClientInfo.trim(),
      }),
    });
    const data = await res.json() as AiEditorClient;
    setCreating(false);
    setShowForm(false);
    setNewName('');
    setNewFbUser(''); setNewFbPass(''); setNewThUser(''); setNewThPass(''); setNewIgUser(''); setNewIgPass('');
    setNewLineUid(''); setNewKeywords(''); setNewPersona(''); setNewClientInfo('');
    loadClients();
    if (data.id) router.push(`/ai-editor/${data.id}`);
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI 小編</h1>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => router.push('/ai-editor/setup-guide')}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              授權設定教學
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              + 新增客戶
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500">自動偵測官網新文章，產生 AI 圖文草稿，透過 LINE 審核後自動上架社群。</p>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 max-w-md">
          <p className="text-sm font-semibold text-gray-800">新增客戶</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="客戶名稱 *" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <div className="flex gap-2">
            <input value={newFbUser} onChange={e => setNewFbUser(e.target.value)} placeholder="FB 帳號" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={newFbPass} onChange={e => setNewFbPass(e.target.value)} placeholder="FB 密碼" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
          </div>
          <div className="flex gap-2">
            <input value={newThUser} onChange={e => setNewThUser(e.target.value)} placeholder="Threads 帳號" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={newThPass} onChange={e => setNewThPass(e.target.value)} placeholder="Threads 密碼" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
          </div>
          <div className="flex gap-2">
            <input value={newIgUser} onChange={e => setNewIgUser(e.target.value)} placeholder="IG 帳號" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={newIgPass} onChange={e => setNewIgPass(e.target.value)} placeholder="IG 密碼" className="w-1/2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
          </div>
          <input value={newLineUid} onChange={e => setNewLineUid(e.target.value)} placeholder="LINE UID（選填）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="產業關鍵字（逗號分隔，例：植牙, 牙齒美白）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <textarea value={newPersona} onChange={e => setNewPersona(e.target.value)} rows={3} placeholder={`小編人設（例：溫暖親切的醫美診所小編，說話口吻輕鬆但專業，不用過度使用表情符號）`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <textarea value={newClientInfo} onChange={e => setNewClientInfo(e.target.value)} rows={3} placeholder={`客戶資訊（例：台北植牙診所，目標受眾為 30-50 歲上班族，主打無痛療程與透明收費）`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName.trim()} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
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
                  <span className="text-gray-400 shrink-0 w-14">社群</span>
                  {accountPreview(c)
                    ? <span className="text-gray-600 truncate whitespace-pre">{accountPreview(c)}</span>
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
                <div className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0 w-14">客戶資訊</span>
                  {c.client_info
                    ? <span className="text-gray-600 truncate">{c.client_info}</span>
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
