'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type PlatformKey = 'FB' | 'IG' | 'YT' | 'TikTok' | 'Threads';

const PLATFORM_DEFS: { key: PlatformKey; placeholder: string }[] = [
  { key: 'FB',      placeholder: 'https://www.facebook.com/帳號名稱' },
  { key: 'IG',      placeholder: 'https://www.instagram.com/帳號名稱/' },
  { key: 'YT',      placeholder: 'https://www.youtube.com/@頻道名稱' },
  { key: 'TikTok',  placeholder: 'https://www.tiktok.com/@帳號名稱' },
  { key: 'Threads', placeholder: 'https://www.threads.net/@帳號名稱' },
];

type PlatformUrls = Record<PlatformKey, string[]>;
const EMPTY_URLS: PlatformUrls = { FB: [''], IG: [''], YT: [''], TikTok: [''], Threads: [''] };

interface ClientData {
  id: string; name: string; slack_id: string | null; created_at: string;
  platforms: { platform: string; urls: string[] }[];
}

interface SocialPost {
  id: number; platform: string; account: string | null; post_url: string | null;
  content: string | null; likes: number | null; comments: number | null;
  views: number | null; thumbnail: string | null; post_date: string | null;
  hashtags: string | null; video_url: string | null;
}

interface SocialJob {
  id: string; status: 'processing' | 'completed' | 'failed';
  date_from: string | null; date_to: string | null;
  message: string | null; created_at: string; posts: SocialPost[];
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlack, setEditSlack] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [platformUrls, setPlatformUrls] = useState<PlatformUrls>(EMPTY_URLS);
  const [savingUrls, setSavingUrls] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [urlsOpen, setUrlsOpen] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');

  const [deleting, setDeleting] = useState(false);

  // 報告
  const [latestJob, setLatestJob] = useState<SocialJob | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // ── 初始載入 ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/social-clients/${id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then((data: ClientData | null) => {
        if (!data) return;
        setClient(data);
        setEditName(data.name);
        setEditSlack(data.slack_id ?? '');
        const urls: PlatformUrls = { ...EMPTY_URLS };
        for (const { platform, urls: u } of data.platforms) {
          if (platform in urls) urls[platform as PlatformKey] = u.length ? u : [''];
        }
        setPlatformUrls(urls);
      })
      .finally(() => setLoading(false));

    // 載入歷史 jobs
    loadJobs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadJobs() {
    const res = await fetch(`/api/social-clients/${id}/jobs`);
    if (res.ok) {
      const data: SocialJob[] = await res.json();
      // 只取最新一筆已完成的
      const latest = data.find((j) => j.status === 'completed') ?? null;
      setLatestJob(latest);
    }
  }

  // ── 輪詢（最多 20 次，約 3.3 分鐘後逾時）──────────────────
  useEffect(() => {
    if (!activeJobId) return;
    pollCountRef.current = 0;
    setTimedOut(false);
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 20) {
        clearInterval(pollRef.current!);
        setTimedOut(true);
        setActiveJobId(null);
        return;
      }
      const res = await fetch(`/api/social-jobs/${activeJobId}`);
      if (!res.ok) return;
      const job: SocialJob = await res.json();
      if (job.status !== 'processing') {
        clearInterval(pollRef.current!);
        setActiveJobId(null);
        if (job.status === 'completed') setLatestJob(job);
      }
    }, 10000);
    return () => clearInterval(pollRef.current!);
  }, [activeJobId]);

  // ── URL 編輯 ───────────────────────────────────────────────
  function handleUrlChange(key: PlatformKey, index: number, value: string) {
    setPlatformUrls((prev) => { const next = [...prev[key]]; next[index] = value; return { ...prev, [key]: next }; });
  }
  function addUrl(key: PlatformKey) {
    setPlatformUrls((prev) => ({ ...prev, [key]: [...prev[key], ''] }));
  }
  function removeUrl(key: PlatformKey, index: number) {
    setPlatformUrls((prev) => {
      const next = prev[key].filter((_, i) => i !== index);
      return { ...prev, [key]: next.length ? next : [''] };
    });
  }

  // ── 基本資料儲存 ───────────────────────────────────────────
  async function saveInfo() {
    setSavingInfo(true);
    const res = await fetch(`/api/social-clients/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, slackId: editSlack }),
    });
    const data = await res.json();
    if (res.ok) { setClient(data); setEditingInfo(false); }
    setSavingInfo(false);
  }

  async function saveUrls() {
    setSavingUrls(true); setUrlSaved(false);
    const platforms = PLATFORM_DEFS.map((p) => ({
      platform: p.key, urls: platformUrls[p.key].map((u) => u.trim()).filter(Boolean),
    }));
    const res = await fetch(`/api/social-clients/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms }),
    });
    if (res.ok) setUrlSaved(true);
    setSavingUrls(false);
  }

  // ── 觸發 ──────────────────────────────────────────────────
  async function triggerWebhook() {
    setTriggering(true); setTriggerError('');
    try {
      const res = await fetch('/api/social-webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
      });
      let data: { ok?: boolean; jobId?: string; error?: string } = {};
      try { data = await res.json(); } catch { /* ignore */ }
      if (!res.ok || !data.ok) {
        setTriggerError(data.error ?? `伺服器錯誤（HTTP ${res.status}）`);
        return;
      }
      setActiveJobId(data.jobId!);
    } catch (err) {
      setTriggerError(String(err));
    } finally {
      setTriggering(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`確定要刪除「${client?.name}」及所有追蹤帳號與報告？`)) return;
    setDeleting(true);
    await fetch(`/api/social-clients/${id}`, { method: 'DELETE' });
    router.push('/social');
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">載入中…</div>;
  if (notFound) return (
    <div className="p-8 space-y-4">
      <p className="text-sm text-gray-500">找不到此客戶。</p>
      <Link href="/social" className="text-sm text-blue-600 hover:underline">← 返回列表</Link>
    </div>
  );

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <Link href="/social" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        返回客戶列表
      </Link>

      {/* ── 區塊 1：客戶資訊 ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">客戶資訊</h2>
          {!editingInfo && (
            <div className="flex items-center gap-3">
              <button onClick={() => setEditingInfo(true)} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">編輯</button>
              <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50">
                {deleting ? '刪除中…' : '刪除'}
              </button>
            </div>
          )}
        </div>

        {editingInfo ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">客戶名稱</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">Slack 頻道 ID</label>
              <input type="text" value={editSlack} onChange={(e) => setEditSlack(e.target.value)} placeholder="C0XXXXXXXXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveInfo} disabled={savingInfo} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-50">
                {savingInfo ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setEditingInfo(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-gray-700">
            <p><span className="text-gray-400 text-xs mr-2">名稱</span>{client?.name}</p>
            <p><span className="text-gray-400 text-xs mr-2">Slack</span>{client?.slack_id || <span className="text-gray-300">（未設定）</span>}</p>
            <p><span className="text-gray-400 text-xs mr-2">建立</span>{client?.created_at}</p>
          </div>
        )}

        {/* 抓取觸發 */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 shrink-0">貼文日期區間</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400" />
            <span className="text-xs text-gray-300">—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400" />
            {(dateFrom || dateTo) && (
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-gray-300 hover:text-gray-500 transition-colors">清除</button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={triggerWebhook} disabled={triggering || !!activeJobId}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50">
              {triggering ? '送出中…' : activeJobId ? '抓取中…' : '抓取社群內容'}
            </button>
            {activeJobId && (
              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                <svg className="animate-spin w-3.5 h-3.5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                處理中，約 3 分鐘…
              </span>
            )}
            {triggerError && <span className="text-xs text-red-600">✗ {triggerError}</span>}
          </div>
        </div>
      </div>

      {/* ── 區塊 2：追蹤 URL ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <button type="button" onClick={() => setUrlsOpen((v) => !v)} className="w-full flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">各平台帳號網址</h2>
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform ${urlsOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {urlsOpen && <>
          <div className="space-y-3">
            {PLATFORM_DEFS.map((p) => (
              <div key={p.key} className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-16 text-center rounded-full px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600">{p.key}</span>
                  <button type="button" onClick={() => addUrl(p.key)} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    新增
                  </button>
                </div>
                {platformUrls[p.key].map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={url} onChange={(e) => handleUrlChange(p.key, i, e.target.value)} placeholder={p.placeholder}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                    {platformUrls[p.key].length > 1 && (
                      <button type="button" onClick={() => removeUrl(p.key, i)} className="shrink-0 text-gray-300 hover:text-red-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveUrls} disabled={savingUrls} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50">
              {savingUrls ? '儲存中…' : '儲存網址'}
            </button>
            {urlSaved && <span className="text-xs text-emerald-600">✓ 已儲存</span>}
          </div>
        </>}
      </div>

      {/* ── 區塊 3：報告 ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">最新報告</h2>
          {latestJob && (
            <span className="text-xs text-gray-400">
              {latestJob.created_at}・{latestJob.posts.length} 筆貼文
            </span>
          )}
        </div>

        {/* 處理中 */}
        {activeJobId && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            抓取中，約 3 分鐘後自動更新…
          </div>
        )}

        {/* 逾時 */}
        {timedOut && !activeJobId && (
          <p className="text-sm text-yellow-600">逾時，請重新按「抓取社群內容」。</p>
        )}

        {/* 無資料 */}
        {!activeJobId && !latestJob && !timedOut && (
          <p className="text-sm text-gray-300">尚無報告，設定好帳號網址後按「抓取社群內容」開始。</p>
        )}

        {/* 貼文列表 */}
        {latestJob && latestJob.posts.length > 0 && (
          <div className="divide-y divide-gray-100 -mx-5">
            {latestJob.posts.map((post) => (
              <div key={post.id} className="px-5 py-4 space-y-2">
                {/* 影片：全寬顯示 */}
                {post.video_url && (
                  <video
                    src={post.video_url}
                    controls
                    muted
                    loop
                    className="w-full rounded-lg bg-black max-h-72 object-contain"
                  />
                )}
                {/* 縮圖 + 文字並排 */}
                <div className="flex gap-3">
                  {!post.video_url && post.thumbnail && (
                    <img
                      src={post.thumbnail}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover shrink-0 bg-gray-100"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{post.platform}</span>
                      {post.account && <span className="text-xs text-gray-500 truncate">{post.account}</span>}
                      {post.post_date && <span className="text-xs text-gray-300 ml-auto shrink-0">{post.post_date}</span>}
                    </div>
                    {post.content && (
                      <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>
                    )}
                    {post.hashtags && (
                      <p className="text-xs text-blue-400 line-clamp-2">{post.hashtags}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {post.likes != null && <span>❤ {post.likes.toLocaleString()}</span>}
                      {post.comments != null && <span>💬 {post.comments.toLocaleString()}</span>}
                      {post.views != null && <span>👁 {post.views.toLocaleString()}</span>}
                      {post.post_url && (
                        <a href={post.post_url} target="_blank" rel="noreferrer" className="ml-auto text-blue-500 hover:underline shrink-0">
                          查看原文 →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {latestJob && latestJob.posts.length === 0 && !activeJobId && (
          <p className="text-sm text-gray-300">此次抓取無貼文資料。</p>
        )}
      </div>
    </div>
  );
}
