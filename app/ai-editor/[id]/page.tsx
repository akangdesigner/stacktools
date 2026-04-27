'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
  keywords: string;
  persona: string;
  client_info: string;
  recent_activities: string;
}

export default function AiEditorClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<AiEditorClient | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSiteUrl, setEditSiteUrl] = useState('');
  const [editSocialAccount, setEditSocialAccount] = useState('');
  const [editLineUid, setEditLineUid] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPersona, setEditPersona] = useState('');
  const [editClientInfo, setEditClientInfo] = useState('');
  const [editRecentActivities, setEditRecentActivities] = useState('');
  const [saving, setSaving] = useState(false);

  function loadClient() {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((list: AiEditorClient[]) => {
        const found = list.find(c => String(c.id) === id);
        setClient(found ?? null);
      });
  }

  useEffect(() => { loadClient(); }, [id]);

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    await fetch('/api/ai-editor/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name: editName, site_url: editSiteUrl, social_account: editSocialAccount, line_uid: editLineUid, keywords: editKeywords, persona: editPersona, client_info: editClientInfo, recent_activities: editRecentActivities }),
    });
    setSaving(false);
    setEditing(false);
    loadClient();
  }

  async function handleDelete() {
    if (!client || !confirm('確定刪除此客戶？')) return;
    await fetch('/api/ai-editor/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id }),
    });
    router.push('/ai-editor');
  }

  if (!client) return <div className="p-8 text-sm text-gray-400">載入中…</div>;

  return (
    <div className="p-8 space-y-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/ai-editor')} className="hover:text-gray-700 transition-colors">AI 小編</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{client.name}</span>
      </div>

      {/* 客戶資訊 */}
      <div>
        {editing ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">客戶名稱</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">文章列表網址</label>
                <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)} placeholder="https://example.com/blog/category/" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">社群帳號</label>
                <textarea value={editSocialAccount} onChange={e => setEditSocialAccount(e.target.value)} rows={3} placeholder={`IG: @帳號\nFB: 粉專名稱`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">LINE UID</label>
                <input value={editLineUid} onChange={e => setEditLineUid(e.target.value)} placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">產業關鍵字</label>
                <input value={editKeywords} onChange={e => setEditKeywords(e.target.value)} placeholder="植牙, 牙齒美白, 隱形矯正" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">小編人設</label>
                <textarea value={editPersona} onChange={e => setEditPersona(e.target.value)} rows={3} placeholder={`溫暖親切的醫美診所小編，說話口吻輕鬆但專業`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">客戶資訊</label>
                <textarea value={editClientInfo} onChange={e => setEditClientInfo(e.target.value)} rows={3} placeholder={`台北植牙診所，目標受眾 30-50 歲上班族，主打無痛療程`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">近期活動</label>
                <textarea value={editRecentActivities} onChange={e => setEditRecentActivities(e.target.value)} rows={3} placeholder={`5/10 母親節 8 折優惠\n5/20 院長健康講座（免費報名）`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
            </div>
            <div className="col-span-2 flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div className="col-span-2 flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
              <button onClick={() => { setEditName(client.name); setEditSiteUrl(client.site_url); setEditSocialAccount(client.social_account); setEditLineUid(client.line_uid); setEditKeywords(client.keywords ?? ''); setEditPersona(client.persona ?? ''); setEditClientInfo(client.client_info ?? ''); setEditRecentActivities(client.recent_activities ?? ''); setEditing(true); }} className="text-xs text-gray-400 hover:text-gray-700">編輯</button>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">刪除</button>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-400">網址</p>
                <p className="text-xs text-gray-700 font-mono">{client.site_url}</p>
              </div>
              {client.social_account && (
                <div>
                  <p className="text-xs text-gray-400">社群帳號</p>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{client.social_account}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">LINE ID</p>
                {client.line_uid
                  ? <span className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{client.line_uid}</span>
                  : <span className="text-xs text-gray-300 italic">尚未設定</span>
                }
              </div>
              {client.keywords && (
                <div>
                  <p className="text-xs text-gray-400">關鍵字</p>
                  <p className="text-xs text-gray-700">{client.keywords}</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {client.persona && (
                <div>
                  <p className="text-xs text-gray-400">小編人設</p>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{client.persona}</p>
                </div>
              )}
              {client.client_info && (
                <div>
                  <p className="text-xs text-gray-400">客戶資訊</p>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{client.client_info}</p>
                </div>
              )}
              {client.recent_activities && (
                <div>
                  <p className="text-xs text-gray-400">近期活動</p>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{client.recent_activities}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
