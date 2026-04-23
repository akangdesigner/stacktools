'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface AiEditorClient {
  id: number;
  name: string;
  site_url: string;
  social_account: string;
  line_uid: string;
  keywords: string;
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
  const [editKeywords, setEditKeywords] = useState('');
  const [saving, setSaving] = useState(false);

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AiEditorJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const DEMO_COMMENTS = [
    { id: 1, platform: 'IG', commenter: 'user_abc', content: '請問這個療程大概要多少費用？', postUrl: 'https://instagram.com/p/demo1', draft: '感謝您的詢問！費用會依個人狀況評估，建議您直接私訊或來電，我們為您安排免費諮詢 😊', done: false },
    { id: 2, platform: 'FB', commenter: '王小明', content: '我之前做過有點痛，你們有麻醉嗎？', postUrl: 'https://facebook.com/demo2', draft: '您好，我們全程使用局部麻醉，術中幾乎不會感到疼痛，術後也有完整衛教讓您安心恢復。有任何問題歡迎私訊！', done: false },
    { id: 3, platform: 'IG', commenter: 'smile_forever', content: '分享給我朋友看！她也有一樣的困擾', postUrl: 'https://instagram.com/p/demo3', draft: '謝謝您的分享，希望對您的朋友也有幫助！若有任何問題，我們隨時在這裡 💪', done: false },
  ];
  const [comments, setComments] = useState(DEMO_COMMENTS);

  const [trendingTriggering, setTrendingTriggering] = useState(false);
  const [trendingError, setTrendingError] = useState('');
  const [activeTrendingJobId, setActiveTrendingJobId] = useState<string | null>(null);
  const [trendingJob, setTrendingJob] = useState<AiEditorJob | null>(null);
  const trendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!activeTrendingJobId) return;
    trendingPollRef.current = setInterval(async () => {
      const res = await fetch(`/api/ai-editor/trending-post?jobId=${activeTrendingJobId}`);
      if (!res.ok) return;
      const data = (await res.json()) as AiEditorJob;
      setTrendingJob(data);
      if (data.status !== 'processing' && trendingPollRef.current) {
        clearInterval(trendingPollRef.current);
        setActiveTrendingJobId(null);
      }
    }, 2000);
    return () => { if (trendingPollRef.current) clearInterval(trendingPollRef.current); };
  }, [activeTrendingJobId]);

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    await fetch('/api/ai-editor/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name: editName, site_url: editSiteUrl, social_account: editSocialAccount, line_uid: editLineUid, keywords: editKeywords }),
    });
    setSaving(false);
    setEditing(false);
    loadClient();
  }

  async function handleTrendingPost() {
    if (!client) return;
    setTrendingTriggering(true);
    setTrendingError('');
    setTrendingJob(null);
    try {
      const res = await fetch('/api/ai-editor/trending-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) { setTrendingError(data.error ?? '觸發失敗'); return; }
      setActiveTrendingJobId(data.jobId);
    } catch (err) {
      setTrendingError(String(err));
    } finally {
      setTrendingTriggering(false);
    }
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
          <div className="space-y-3 max-w-md">
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="客戶名稱" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)} placeholder="文章列表網址（https://example.com/blog/category/）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <textarea value={editSocialAccount} onChange={e => setEditSocialAccount(e.target.value)} rows={3} placeholder={`IG: @帳號\nFB: 粉專名稱`} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={editLineUid} onChange={e => setEditLineUid(e.target.value)} placeholder="LINE UID" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <input value={editKeywords} onChange={e => setEditKeywords(e.target.value)} placeholder="產業關鍵字（逗號分隔，例：植牙, 牙齒美白）" className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400" />
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
              <button onClick={() => { setEditName(client.name); setEditSiteUrl(client.site_url); setEditSocialAccount(client.social_account); setEditLineUid(client.line_uid); setEditKeywords(client.keywords ?? ''); setEditing(true); }} className="text-xs text-gray-400 hover:text-gray-700">編輯</button>
              <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">刪除</button>
            </div>
            <p className="text-xs text-gray-400">{client.site_url}</p>
            {client.social_account && <p className="text-xs text-gray-500 whitespace-pre-line">{client.social_account}</p>}
            {client.line_uid && <p className="text-xs text-gray-400 font-mono">LINE: {client.line_uid}</p>}
            {client.keywords && <p className="text-xs text-gray-500">關鍵字：{client.keywords}</p>}
          </div>
        )}
      </div>

      {!editing && (
        <div className="grid grid-cols-2 gap-4 items-start">
          {/* 左欄 */}
          <div className="space-y-4">
            {/* 手動觸發 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-800">手動觸發</p>
              <p className="text-xs text-gray-400">偵測文章列表頁最新文章，送至 n8n 產生 AI 圖文草稿。</p>
              <button onClick={handleTrigger} disabled={triggering || !!activeJobId} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {triggering ? '送出中…' : activeJobId ? '處理中…' : '立即產生草稿'}
              </button>
              {triggerError && <p className="text-xs text-red-600">{triggerError}</p>}
              {job && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                  <p className="text-xs text-gray-500">狀態：<span className="font-medium text-gray-700">{job.status}</span></p>
                  <p className="text-sm text-gray-700">{job.message}</p>
                  {job.result?.draftText && <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-48 overflow-auto">{job.result.draftText}</pre>}
                  {job.result?.draftImageUrl && <a href={job.result.draftImageUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">開啟草稿圖片</a>}
                </div>
              )}
            </div>

            {/* 時事互動文 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-800">時事互動文</p>
              <p className="text-xs text-gray-400">AI 結合客戶歷史文章與近期時事，產出互動型社群貼文草稿。</p>
              {!client.keywords && <p className="text-xs text-amber-600">請先填入產業關鍵字。</p>}
              <button onClick={handleTrendingPost} disabled={trendingTriggering || !!activeTrendingJobId || !client.keywords} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {trendingTriggering ? '送出中…' : activeTrendingJobId ? '處理中…' : '✨ 產出時事互動文'}
              </button>
              {trendingError && <p className="text-xs text-red-600">{trendingError}</p>}
              {trendingJob && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                  <p className="text-xs text-gray-500">狀態：<span className="font-medium text-gray-700">{trendingJob.status}</span></p>
                  <p className="text-sm text-gray-700">{trendingJob.message}</p>
                  {trendingJob.result?.draftText && <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-48 overflow-auto">{trendingJob.result.draftText}</pre>}
                  {trendingJob.result?.draftImageUrl && <a href={trendingJob.result.draftImageUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">開啟草稿圖片</a>}
                </div>
              )}
            </div>

            {/* 月主題規劃師 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">月主題規劃師</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">Demo</span>
              </div>
              <p className="text-xs text-gray-400">AI 根據客戶關鍵字與當月節慶，產出整個月的貼文主題清單，推送至 LINE。</p>
              <MonthlyPlanDemo />
            </div>
          </div>

          {/* 右欄 */}
          <div className="space-y-4">
            {/* 節慶搶先提醒 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">節慶搶先提醒</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">Demo</span>
              </div>
              <p className="text-xs text-gray-400">自動偵測近期節慶，提前提醒安排相關貼文，並推送至 LINE。</p>
              <HolidayReminderDemo />
            </div>

            {/* 留言草稿回覆 */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800">留言草稿回覆</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">Demo</span>
                <span className="ml-auto text-xs text-gray-400">{comments.filter(c => !c.done).length} 則待處理</span>
              </div>
              {comments.length === 0 ? (
                <p className="text-xs text-gray-400">目前沒有待回覆的留言。</p>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className={`rounded-lg border p-3 space-y-2 transition-opacity ${c.done ? 'opacity-40' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${c.platform === 'IG' ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>{c.platform}</span>
                        <span className="font-medium text-gray-600">{c.commenter}</span>
                        <a href={c.postUrl} target="_blank" rel="noreferrer" className="ml-auto hover:text-gray-600 underline underline-offset-2">貼文連結</a>
                      </div>
                      <p className="text-sm text-gray-700">「{c.content}」</p>
                      <div className="rounded bg-indigo-50 border border-indigo-100 px-3 py-2">
                        <p className="text-xs text-indigo-400 mb-1">AI 草稿</p>
                        <p className="text-xs text-indigo-900">{c.draft}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => navigator.clipboard.writeText(c.draft)} className="px-2.5 py-1 rounded text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">複製草稿</button>
                        {c.done ? (
                          <button onClick={() => setComments(prev => prev.map(x => x.id === c.id ? { ...x, done: false } : x))} className="px-2.5 py-1 rounded text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">撤銷</button>
                        ) : (
                          <button onClick={() => setComments(prev => prev.map(x => x.id === c.id ? { ...x, done: true } : x))} className="px-2.5 py-1 rounded text-xs bg-gray-900 text-white hover:bg-gray-700 transition-colors">已回覆</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthlyPlanDemo() {
  const [shown, setShown] = useState(false);
  const now = new Date();
  const month = now.getMonth() + 1;
  const TOPICS = [
    { date: `${month}/3`, title: '春季保養入門：從清潔開始', type: '教學' },
    { date: `${month}/6`, title: '你知道嗎？3 個常見迷思破解', type: '互動' },
    { date: `${month}/10`, title: '客戶真實回饋分享', type: '社群' },
    { date: `${month}/13`, title: '週末限定優惠活動', type: '促銷' },
    { date: `${month}/17`, title: 'Q&A 直播預告：專家現場解答', type: '互動' },
    { date: `${month}/20`, title: '節慶特輯：給自己一份禮物', type: '節慶' },
    { date: `${month}/24`, title: '產品成分解析：你該知道的事', type: '教學' },
    { date: `${month}/28`, title: '粉絲票選：下個月想看什麼？', type: '互動' },
  ];
  const typeColor: Record<string, string> = {
    教學: 'bg-blue-50 text-blue-600',
    互動: 'bg-purple-50 text-purple-600',
    社群: 'bg-green-50 text-green-600',
    促銷: 'bg-orange-50 text-orange-600',
    節慶: 'bg-pink-50 text-pink-600',
  };
  return (
    <div className="space-y-3">
      <button
        onClick={() => setShown(v => !v)}
        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        {shown ? '收起計畫' : '產出本月計畫'}
      </button>
      {shown && (
        <div className="space-y-2">
          {TOPICS.map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-400 w-10 shrink-0">{t.date}</span>
              <span className="text-sm text-gray-800 flex-1">{t.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[t.type] ?? 'bg-gray-100 text-gray-500'}`}>{t.type}</span>
            </div>
          ))}
          <button disabled title="開發中" className="mt-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 cursor-not-allowed">
            推送到 LINE（開發中）
          </button>
        </div>
      )}
    </div>
  );
}

function HolidayReminderDemo() {
  const now = new Date();
  const daysUntil = (month: number, day: number) => {
    const target = new Date(now.getFullYear(), month - 1, day);
    if (target < now) target.setFullYear(now.getFullYear() + 1);
    return Math.ceil((target.getTime() - now.getTime()) / 86400000);
  };
  const HOLIDAYS = [
    { name: '母親節', days: daysUntil(5, 12), topics: ['感謝媽媽系列', '親子活動推薦', '母親節限定優惠'] },
    { name: '端午節', days: daysUntil(6, 10), topics: ['節慶應景貼文', '假期出遊推薦', '傳統文化趣知識'] },
    { name: '中秋節', days: daysUntil(9, 17), topics: ['月圓家人團聚', '中秋禮盒推薦', '烤肉活動紀錄'] },
  ].sort((a, b) => a.days - b.days);
  return (
    <div className="space-y-3">
      {HOLIDAYS.map((h, i) => (
        <div key={i} className={`rounded-lg border p-3 space-y-2 ${h.days <= 7 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{h.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.days <= 7 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
              {h.days <= 7 ? `⚡ 剩 ${h.days} 天` : `${h.days} 天後`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {h.topics.map((t, j) => (
              <span key={j} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">{t}</span>
            ))}
          </div>
          <button disabled title="開發中" className="px-3 py-1 rounded text-xs border border-gray-200 text-gray-400 cursor-not-allowed">
            產出草稿（開發中）
          </button>
        </div>
      ))}
    </div>
  );
}
