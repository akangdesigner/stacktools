'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Client {
  id: number;
  name: string;
  word_url: string;
  gdrive_url: string;
  persona: string;
  wp_url: string;
  wp_username: string;
  wp_app_password: string;
  wp_category_id: string;
  h2_color: string;
  h2_size: string;
  h3_color: string;
  h3_size: string;
  faq_q_color: string;
  faq_q_size: string;
  job_id: string;
  job_status: string;
  job_result: string;
  job_updated: string;
}

export default function BlogGenDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', word_url: '', gdrive_url: '', persona: '', wp_url: '', wp_username: '', wp_app_password: '', wp_category_id: '', h2_color: '', h2_size: '', h3_color: '', h3_size: '', faq_q_color: '#000000', faq_q_size: '16px' });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchClient();
    return () => stopPoll();
  }, [id]);

  async function fetchClient() {
    const res = await fetch(`/api/blog-gen/clients?id=${id}`);
    if (!res.ok) { router.push('/blog-gen'); return; }
    const data: Client = await res.json();
    setClient(data);
    setForm({ name: data.name, word_url: data.word_url, gdrive_url: data.gdrive_url, persona: data.persona, wp_url: data.wp_url, wp_username: data.wp_username, wp_app_password: data.wp_app_password, wp_category_id: data.wp_category_id, h2_color: data.h2_color, h2_size: data.h2_size, h3_color: data.h3_color, h3_size: data.h3_size, faq_q_color: data.faq_q_color || '#000000', faq_q_size: data.faq_q_size || '16px' });
    if (data.job_status === 'processing') startPoll();
  }

  function startPoll() {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/blog-gen/status?clientId=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.job_status !== 'processing') {
        stopPoll();
        setClient(prev => prev ? { ...prev, ...data } : prev);
        setGenerating(false);
      }
    }, 3000);
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    const res = await fetch('/api/blog-gen/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), ...form, wp_category_id: form.wp_category_id.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg('已儲存');
      setClient(prev => prev ? { ...prev, ...form } : prev);
      setTimeout(() => setSaveMsg(''), 2000);
    }
  }

  async function handleGenerate() {
    if (!client?.word_url) { alert('請先填入 Word 文件網址'); return; }
    setGenerating(true);
    const res = await fetch('/api/blog-gen/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: Number(id) }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '生成失敗');
      setGenerating(false);
      return;
    }
    setClient(prev => prev ? { ...prev, job_status: 'processing', job_result: '' } : prev);
    startPoll();
  }

  async function handleCancel() {
    await fetch('/api/blog-gen/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: Number(id) }),
    });
    stopPoll();
    setGenerating(false);
    setClient(prev => prev ? { ...prev, job_status: '', job_id: '', job_result: '' } : prev);
  }

  async function handleDelete() {
    if (!confirm(`確定要刪除客戶「${client?.name}」？`)) return;
    setDeleting(true);
    await fetch(`/api/blog-gen/clients?id=${id}`, { method: 'DELETE' });
    router.push('/blog-gen');
  }

  if (!client) return <div className="p-8 text-gray-400">載入中...</div>;

  const isProcessing = client.job_status === 'processing' || generating;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/blog-gen')} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900 flex-1">{client.name}</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          刪除客戶
        </button>
      </div>

      {/* 參考資料區 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-blue-800">參考資料</h2>

        <div>
          <label className="block text-xs text-blue-700 mb-1">Word 文件網址</label>
          <input
            type="url"
            value={form.word_url}
            onChange={e => setForm(f => ({ ...f, word_url: e.target.value }))}
            placeholder="https://..."
            className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs text-blue-700 mb-1">Google Drive 圖片位址</label>
          <input
            type="url"
            value={form.gdrive_url}
            onChange={e => setForm(f => ({ ...f, gdrive_url: e.target.value }))}
            placeholder="https://drive.google.com/..."
            className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '儲存中...' : '儲存'}
          </button>
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
        </div>
      </div>

      {/* 固定設定 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">固定設定</h2>

        <div>
          <label className="block text-xs text-gray-500 mb-1">客戶名稱</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">部落格小編人設</label>
          <textarea
            value={form.persona}
            onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
            rows={4}
            placeholder="描述小編的寫作風格、口吻、品牌個性..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">WordPress 發布設定</p>

        <div>
          <label className="block text-xs text-gray-500 mb-1">WordPress 站台網址</label>
          <input
            type="url"
            value={form.wp_url}
            onChange={e => setForm(f => ({ ...f, wp_url: e.target.value }))}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">WordPress 帳號</label>
            <input
              type="text"
              value={form.wp_username}
              onChange={e => setForm(f => ({ ...f, wp_username: e.target.value }))}
              placeholder="admin"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">分類 ID</label>
            <input
              type="text"
              value={form.wp_category_id}
              onChange={e => setForm(f => ({ ...f, wp_category_id: e.target.value }))}
              placeholder="5"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">應用程式密碼</label>
          <input
            type="password"
            value={form.wp_app_password}
            onChange={e => setForm(f => ({ ...f, wp_app_password: e.target.value }))}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">WordPress 後台 → 使用者 → 個人資料 → 應用程式密碼</p>
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">文章樣式設定（選填）</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">H2 顏色</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.h2_color || '#000000'}
                onChange={e => setForm(f => ({ ...f, h2_color: e.target.value }))}
                className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.h2_color}
                onChange={e => setForm(f => ({ ...f, h2_color: e.target.value }))}
                placeholder="#000000"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">H2 字體大小</label>
            <input
              type="text"
              value={form.h2_size}
              onChange={e => setForm(f => ({ ...f, h2_size: e.target.value }))}
              placeholder="24px"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">H3 顏色</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.h3_color || '#000000'}
                onChange={e => setForm(f => ({ ...f, h3_color: e.target.value }))}
                className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.h3_color}
                onChange={e => setForm(f => ({ ...f, h3_color: e.target.value }))}
                placeholder="#000000"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">H3 字體大小</label>
            <input
              type="text"
              value={form.h3_size}
              onChange={e => setForm(f => ({ ...f, h3_size: e.target.value }))}
              placeholder="20px"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <hr className="border-gray-100" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">FAQ 樣式設定</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">問題（Q）顏色</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={form.faq_q_color || '#000000'}
                onChange={e => setForm(f => ({ ...f, faq_q_color: e.target.value }))}
                className="w-9 h-9 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={form.faq_q_color}
                onChange={e => setForm(f => ({ ...f, faq_q_color: e.target.value }))}
                placeholder="#000000"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">問題（Q）字體大小</label>
            <input
              type="text"
              value={form.faq_q_size}
              onChange={e => setForm(f => ({ ...f, faq_q_size: e.target.value }))}
              placeholder="16px"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '儲存中...' : '儲存設定'}
          </button>
          {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
        </div>
      </div>

      {/* 生成區 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">文章生成</h2>
          {client.job_updated && (
            <span className="text-xs text-gray-400">
              最後更新：{client.job_updated.replace('T', ' ').slice(0, 16)}
            </span>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isProcessing ? (
              <>
                <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                生成中，請稍候...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                生成並上架
              </>
            )}
          </button>
          {isProcessing && (
            <button
              onClick={handleCancel}
              className="px-4 py-3 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          )}
        </div>

        {/* 結果顯示 */}
        {client.job_status === 'completed' && client.job_result && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">生成完成</span>
              <button
                onClick={() => { navigator.clipboard.writeText(client.job_result); }}
                className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              >
                複製內容
              </button>
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
              {client.job_result}
            </pre>
          </div>
        )}

        {client.job_status === 'failed' && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            生成失敗：{client.job_result || '未知錯誤，請重試'}
          </div>
        )}

        {!client.job_status && (
          <p className="text-xs text-gray-400 text-center">尚未生成過文章</p>
        )}
      </div>
    </div>
  );
}
