'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
}

interface AiEditorJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  result?: {
    draftText?: string;
    draftImageUrl?: string;
  };
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
  const [saving, setSaving] = useState(false);

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AiEditorJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadClient() {
    fetch('/api/ai-editor/clients')
      .then(r => r.json())
      .then((list: AiEditorClient[]) => {
        const found = list.find(c => String(c.id) === id);
        setClient(found ?? null);
      });
  }

  useEffect(() => { loadClient(); }, [id]);

  useEffect(() => {
    if (!activeJobId) return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/ai-editor/trigger?jobId=${activeJobId}`);
      if (!res.ok) return;
      const data = (await res.json()) as AiEditorJob;
      setJob(data);
      if (data.status !== 'processing' && pollRef.current) {
        clearInterval(pollRef.current);
        setActiveJobId(null);
      }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeJobId]);

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    await fetch('/api/ai-editor/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name: editName, site_url: editSiteUrl, social_account: editSocialAccount, line_uid: editLineUid }),
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

  async function handleTrigger() {
    if (!client) return;
    setTriggering(true);
    setTriggerError('');
    setJob(null);
    try {
      const res = await fetch('/api/ai-editor/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: client.site_url,
          socialAccount: client.social_account,
          lineUid: client.line_uid,
        }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) { setTriggerError(data.error ?? '觸發失敗'); return; }
      setActiveJobId(data.jobId);
    } catch (err) {
      setTriggerError(String(err));
    } finally {
      setTriggering(false);
    }
  }

  if (!client) return <div className="p-8 text-sm text-gray-400">載入中…</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/ai-editor')} className="hover:text-gray-700 transition-colors">AI 小編</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{client.name}</span>
      </div>

      {/* 客戶資訊 */}
      <div>
        {editing ? (
          <div className="space-y-3 max-w-md">
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="客戶名稱" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)} placeholder="文章列表網址（https://example.com/blog/category/）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <textarea value={editSocialAccount} onChange={e => setEditSocialAccount(e.target.value)} rows={3} placeholder={`IG: @帳號\nFB: 粉專名稱`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={editLineUid} onChange={e => setEditLineUid(e.target.value)} placeholder="LINE UID" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
              <button onClick={() => { setEditName(client.name); setEditSiteUrl(client.site_url); setEditSocialAccount(client.social_account); setEditLineUid(client.line_uid); setEditing(true); }} className="text-xs text-gray-400 hover:text-gray-700">編輯</button>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">刪除</button>
            </div>
            <p className="text-xs text-gray-400">{client.site_url}</p>
            {client.social_account && <p className="text-xs text-gray-500 whitespace-pre-line">{client.social_account}</p>}
            {client.line_uid && <p className="text-xs text-gray-400 font-mono">LINE: {client.line_uid}</p>}
          </div>
        )}
      </div>

      {/* 手動觸發 */}
      {!editing && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">手動觸發</p>
          <p className="text-xs text-gray-400">偵測文章列表頁最新文章，送至 n8n 產生 AI 圖文草稿（RSS: 列表網址 + /feed/）。</p>
          <button
            onClick={handleTrigger}
            disabled={triggering || !!activeJobId || !client.line_uid}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {triggering ? '送出中…' : activeJobId ? '處理中…' : '立即產生草稿'}
          </button>
          {!client.line_uid && <p className="text-xs text-amber-600">請先填寫 LINE UID 才能觸發</p>}
          {triggerError && <p className="text-xs text-red-600">{triggerError}</p>}
          {job && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
              <p className="text-xs text-gray-500">任務狀態：<span className="font-medium text-gray-700">{job.status}</span></p>
              <p className="text-sm text-gray-700">{job.message}</p>
              {job.result?.draftText && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">草稿文字</p>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-56 overflow-auto">{job.result.draftText}</pre>
                </div>
              )}
              {job.result?.draftImageUrl && (
                <a href={job.result.draftImageUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-600 hover:underline">開啟草稿圖片</a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
