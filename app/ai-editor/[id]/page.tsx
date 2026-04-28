'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  buffer_code: string;
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
  const [editBufferCode, setEditBufferCode] = useState('');
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
      body: JSON.stringify({ id: client.id, name: editName, site_url: editSiteUrl, social_account: editSocialAccount, line_uid: editLineUid, keywords: editKeywords, persona: editPersona, client_info: editClientInfo, recent_activities: editRecentActivities, buffer_code: editBufferCode }),
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
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        {/* 標題列 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{client.name}</h1>
          {!editing && (
            <div className="flex gap-3">
              <button
                onClick={() => { setEditName(client.name); setEditSiteUrl(client.site_url); setEditSocialAccount(client.social_account); setEditLineUid(client.line_uid); setEditKeywords(client.keywords ?? ''); setEditPersona(client.persona ?? ''); setEditClientInfo(client.client_info ?? ''); setEditRecentActivities(client.recent_activities ?? ''); setEditBufferCode(client.buffer_code ?? ''); setEditing(true); }}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >編輯</button>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 transition-colors">刪除</button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <FieldCard label="文章列表網址">
              <AutoTextarea value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)} placeholder="https://example.com/blog/category/" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="LINE UID">
              <AutoTextarea value={editLineUid} onChange={e => setEditLineUid(e.target.value)} placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="社群帳號">
              <AutoTextarea value={editSocialAccount} onChange={e => setEditSocialAccount(e.target.value)} placeholder={`IG: @帳號\nFB: 粉專名稱`} className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="產業關鍵字">
              <AutoTextarea value={editKeywords} onChange={e => setEditKeywords(e.target.value)} placeholder="植牙, 牙齒美白, 隱形矯正" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="客戶資訊">
              <AutoTextarea value={editClientInfo} onChange={e => setEditClientInfo(e.target.value)} placeholder="台北植牙診所，目標受眾 30-50 歲上班族，主打無痛療程" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="小編人設">
              <AutoTextarea value={editPersona} onChange={e => setEditPersona(e.target.value)} placeholder="溫暖親切的醫美診所小編，說話口吻輕鬆但專業" className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="近期活動" className="col-span-2">
              <AutoTextarea value={editRecentActivities} onChange={e => setEditRecentActivities(e.target.value)} placeholder={`5/10 母親節 8 折優惠\n5/20 院長健康講座（免費報名）`} className="w-full bg-transparent text-xs text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <FieldCard label="Buffer 管理代碼" className="col-span-2">
              <AutoTextarea value={editBufferCode} onChange={e => setEditBufferCode(e.target.value)} placeholder="Buffer channel ID 或管理代碼" className="w-full bg-transparent text-xs font-mono text-gray-800 resize-none focus:outline-none placeholder:text-gray-300" />
            </FieldCard>
            <div className="col-span-2 flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FieldCard label="文章列表網址">
              <p className="text-xs text-gray-700 font-mono break-all">{client.site_url || '—'}</p>
            </FieldCard>
            <FieldCard label="LINE ID">
              {client.line_uid
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">{client.line_uid}</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
            <FieldCard label="社群帳號">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.social_account || '—'}</p>
            </FieldCard>
            <FieldCard label="產業關鍵字">
              <p className="text-xs text-gray-700">{client.keywords || '—'}</p>
            </FieldCard>
            <FieldCard label="客戶資訊">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.client_info || '—'}</p>
            </FieldCard>
            <FieldCard label="小編人設">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.persona || '—'}</p>
            </FieldCard>
            <FieldCard label="近期活動" className="col-span-2">
              <p className="text-xs text-gray-700 whitespace-pre-line">{client.recent_activities || '—'}</p>
            </FieldCard>
            <FieldCard label="Buffer 管理代碼" className="col-span-2">
              {client.buffer_code
                ? <span className="text-xs font-mono text-gray-800 bg-white border border-gray-200 px-2 py-0.5 rounded">{client.buffer_code}</span>
                : <span className="text-xs text-gray-300 italic">尚未設定</span>}
            </FieldCard>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5 ${className ?? ''}`}>
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      {children}
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = ref.current.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={1}
      className={className}
      style={{ overflow: 'hidden' }}
    />
  );
}
