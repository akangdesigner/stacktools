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

const PLATFORM_COLORS: Record<string, string> = {
  FB: 'bg-blue-600',
  IG: 'bg-pink-500',
  YT: 'bg-red-600',
  TikTok: 'bg-gray-900',
  Threads: 'bg-gray-700',
};

interface ClientData {
  id: string; name: string; slack_id: string | null; auto_monitor: number; created_at: string;
  platforms: { platform: string; urls: string[] }[];
}

interface SocialPost {
  id: number; platform: string; account: string | null; post_url: string | null;
  content: string | null; likes: number | null; comments: number | null;
  views: number | null; thumbnail: string | null; profile_pic_url: string | null;
  post_date: string | null; hashtags: string | null; video_url: string | null;
  is_video: number | null;
}

interface SocialJob {
  id: string; status: 'processing' | 'completed' | 'failed';
  date_from: string | null; date_to: string | null;
  message: string | null; created_at: string; posts: SocialPost[];
}


function proxyImg(url: string | null): string | null {
  if (!url) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}


function getEmbedUrl(platform: string, postUrl: string | null): string | null {
  if (!postUrl) return null;
  if (platform === 'IG') {
    const m = postUrl.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/);
    if (m) return `https://www.instagram.com/p/${m[1]}/embed/`;
  }
  if (platform === 'YT') {
    const m = postUrl.match(/[?&]v=([^&]+)/);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  if (platform === 'Threads') {
    // 格式1：threads.net/@user/post/CODE
    const m1 = postUrl.match(/threads\.net\/@[^/]+\/post\/([^/?#]+)/);
    if (m1) return `https://www.threads.net/t/${m1[1]}/embed`;
    // 格式2：threads.net/t/CODE（直接由 code 建構）
    const m2 = postUrl.match(/threads\.net\/t\/([^/?#]+)/);
    if (m2) return `https://www.threads.net/t/${m2[1]}/embed`;
  }
  if (platform === 'TikTok') {
    const m = postUrl.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    if (m) return `https://www.tiktok.com/embed/v2/${m[1]}?autoplay=0`;
  }
  if (platform === 'FB') {
    if (/facebook\.com\/(reel|watch|video)/.test(postUrl) || /facebook\.com\/.*\/videos\//.test(postUrl)) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(postUrl)}&show_text=true&width=500`;
    }
    if (/facebook\.com\/.+\/posts\//.test(postUrl) || /facebook\.com\/permalink/.test(postUrl)) {
      return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(postUrl)}&show_text=true&width=500`;
    }
  }
  return null;
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
  const [activePlatforms, setActivePlatforms] = useState<PlatformKey[]>(PLATFORM_DEFS.map(p => p.key));
  const [savingUrls, setSavingUrls] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [urlsOpen, setUrlsOpen] = useState(false);

  const [dateFrom, setDateFrom] = useState('');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');

  const [deleting, setDeleting] = useState(false);
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [savingMonitor, setSavingMonitor] = useState(false);

  // 報告
  const [latestJob, setLatestJob] = useState<SocialJob | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [filterOwner, setFilterOwner] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [latestN, setLatestN] = useState('');
  const [appliedLatestN, setAppliedLatestN] = useState('');

  // ── 初始載入 ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/social-clients/${id}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then((data: ClientData | null) => {
        if (!data) return;
        setClient(data);
        setEditName(data.name);
        setEditSlack(data.slack_id ?? '');
        setAutoMonitor(data.auto_monitor === 1);
        const urls: PlatformUrls = { ...EMPTY_URLS };
        for (const { platform, urls: u } of data.platforms) {
          if (platform in urls) urls[platform as PlatformKey] = u.length ? u : [''];
        }
        setPlatformUrls(urls);
        // 有填入 URL 的平台才顯示，其餘預設也顯示（新客戶全開）
        const withUrls = data.platforms.filter(p => p.urls.length > 0).map(p => p.platform as PlatformKey);
        if (withUrls.length > 0) setActivePlatforms(withUrls);
      })
      .finally(() => setLoading(false));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadJobs() {
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/social-clients/${id}/jobs`);
      if (res.ok) {
        const data: SocialJob[] = await res.json();
        // 只取有貼文的最新一筆 completed job，避免舊的錯誤資料污染
        const latest = data.find((j) => j.status === 'completed' && j.posts.length > 0);
        if (!latest) { setLatestJob(null); return; }
        // 過濾掉平台為空的異常資料
        const validPosts = latest.posts.filter((p) => p.platform && p.platform.trim() !== '');
        setLatestJob({ ...latest, posts: validPosts });
      }
    } finally {
      setJobsLoading(false);
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
        if (job.status === 'completed') {
          // 重新 loadJobs 以合併所有 job 貼文
          await loadJobs();
          setPostsLoaded(true);
          setJustCompleted(true);
        }
      }
    }, 10000);
    return () => clearInterval(pollRef.current!);
  }, [activeJobId]);

  // 篩選動作或重新載入時，清掉「更新完成」提示
  useEffect(() => {
    setJustCompleted(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPlatform, filterOwner, appliedDateFrom, appliedLatestN, postsLoaded]);

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
  function clearPlatform(key: PlatformKey) {
    setPlatformUrls((prev) => ({ ...prev, [key]: [''] }));
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
    setJustCompleted(false);
    setTriggering(true); setTriggerError('');
    try {
      const res = await fetch('/api/social-webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id }),
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

  async function toggleAutoMonitor() {
    setSavingMonitor(true);
    const next = !autoMonitor;
    await fetch(`/api/social-clients/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoMonitor: next }),
    });
    setAutoMonitor(next);
    setSavingMonitor(false);
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
    <div className="p-8 space-y-8">
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
          <>
          <div className="space-y-1 text-sm text-gray-700">
            <p><span className="text-gray-400 text-xs mr-2">名稱</span>{client?.name}</p>
            <p><span className="text-gray-400 text-xs mr-2">Slack 頻道 ID</span>{client?.slack_id || <span className="text-gray-300">（未設定）</span>}</p>
            <p><span className="text-gray-400 text-xs mr-2">建立</span>{client?.created_at}</p>
          </div>

          {/* 自動監控開關 */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-medium text-gray-800">定期自動更新</p>
              <p className="text-xs text-gray-400 mt-0.5">開啟後，系統會依排程自動抓取最新貼文</p>
            </div>
            <button
              type="button"
              onClick={toggleAutoMonitor}
              disabled={savingMonitor}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${autoMonitor ? 'bg-gray-900' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${autoMonitor ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          </>
        )}

        {/* 抓取觸發 */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={triggerWebhook} disabled={triggering || !!activeJobId}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50">
              {triggering ? '送出中…' : activeJobId ? '更新中…' : '手動更新報告'}
            </button>
            {justCompleted && !activeJobId && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                報告已更新完成
              </span>
            )}
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
            {PLATFORM_DEFS.filter(p => activePlatforms.includes(p.key)).map((p) => (
              <div key={p.key} className="rounded-xl border border-gray-200 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-center rounded-full px-2 py-0.5 text-xs font-bold bg-gray-100 text-gray-600">{p.key}</span>
                    <button type="button" onClick={() => { clearPlatform(p.key); setActivePlatforms(prev => prev.filter(k => k !== p.key)); }}
                      className="text-gray-300 hover:text-red-400 transition-colors" title="刪除此平台">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
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
            {/* 已移除的平台 → 可加回 */}
            {PLATFORM_DEFS.filter(p => !activePlatforms.includes(p.key)).length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="text-xs text-gray-400">新增平台</span>
                {PLATFORM_DEFS.filter(p => !activePlatforms.includes(p.key)).map(p => (
                  <button key={p.key} type="button"
                    onClick={() => setActivePlatforms(prev => [...prev, p.key])}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
                    + {p.key}
                  </button>
                ))}
              </div>
            )}
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
          <h2 className="text-base font-semibold text-gray-800">社群貼文報告</h2>
          {latestJob && (
            <span className="text-xs text-gray-400">
              {latestJob.created_at.slice(0, 10).replace(/-/g, '/')}・{latestJob.posts.length} 筆貼文
            </span>
          )}
        </div>

        {/* 提示輸入日期 */}
        {!postsLoaded && !activeJobId && !jobsLoading && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-500">請選擇篩選方式後載入報告</p>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400" />
              <span className="text-xs text-gray-300">或</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">每平台最新</span>
                <input
                  type="number" min="1" value={latestN} onChange={(e) => setLatestN(e.target.value)} placeholder="N"
                  className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <span className="text-xs text-gray-400">篇</span>
              </div>
              <button
                type="button"
                onClick={() => { if (dateFrom) setAppliedDateFrom(dateFrom); if (latestN) setAppliedLatestN(latestN); loadJobs(); setPostsLoaded(true); }}
                disabled={!dateFrom && !latestN}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                載入報告
              </button>
            </div>
          </div>
        )}

        {/* 初次載入 */}
        {postsLoaded && jobsLoading && !activeJobId && (
          <div className="flex items-center gap-2.5 py-2">
            <svg className="animate-spin w-4 h-4 text-gray-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span className="text-sm text-gray-400">報告載入中…</span>
          </div>
        )}

        {/* 處理中 */}
        {activeJobId && (
          <div className="flex items-center gap-2.5 px-1 py-2">
            <svg className="animate-spin w-4 h-4 text-gray-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span className="text-sm text-gray-500">正在抓取各平台貼文，完成後自動更新…</span>
          </div>
        )}

        {/* 逾時 */}
        {timedOut && !activeJobId && (
          <p className="text-sm text-yellow-600">逾時，請重新按「手動更新報告」。</p>
        )}

        {/* 無資料 */}
        {postsLoaded && !activeJobId && !latestJob && !timedOut && !jobsLoading && (
          <p className="text-sm text-gray-300">尚無報告，設定好帳號網址後按「手動更新報告」開始。</p>
        )}

        {/* 貼文列表 */}
        {latestJob && latestJob.posts.length > 0 && !jobsLoading && (() => {
          const job = latestJob;
          const platforms = Array.from(new Set(job.posts.map((p) => p.platform)));
          const activePlatform = filterPlatform ?? platforms[0];

          // 擁有者清單（依目前平台）
          const owners = Array.from(new Set(
            job.posts.filter((p) => p.platform === activePlatform && p.account).map((p) => p.account!)
          ));

          const dateFiltered = appliedDateFrom
            ? job.posts.filter((p) => {
                if (!p.post_date) return false;
                const raw = String(p.post_date);
                let pd: Date;
                if (/^\d{10}$/.test(raw)) pd = new Date(Number(raw) * 1000);
                else if (/^\d{13}$/.test(raw)) pd = new Date(Number(raw));
                else {
                  const norm = raw.replace(/\//g, '-').split('T')[0].split(' ')[0];
                  const [y, m, d] = norm.split('-').map(Number);
                  pd = new Date(y, m - 1, d);
                }
                const [sy, sm, sd] = appliedDateFrom.split('-').map(Number);
                return pd >= new Date(sy, sm - 1, sd);
              })
            : job.posts;

          const filtered = job.posts.filter((p) => {
            if (p.platform !== activePlatform) return false;
            if (filterOwner && p.account !== filterOwner) return false;
            if (appliedDateFrom) {
              // 沒有日期的貼文，篩選模式下隱藏
              if (!p.post_date) return false;
              // 穩健解析：新資料已為 ISO，舊資料支援 Unix timestamp / YYYY/MM/DD
              const raw = String(p.post_date);
              let postDate: Date;
              if (/^\d{10}$/.test(raw)) {
                postDate = new Date(Number(raw) * 1000);
              } else if (/^\d{13}$/.test(raw)) {
                postDate = new Date(Number(raw));
              } else {
                const normalized = raw.replace(/\//g, '-').split('T')[0].split(' ')[0];
                const [y, m, d] = normalized.split('-').map(Number);
                postDate = new Date(y, m - 1, d);
              }
              const [sy, sm, sd] = appliedDateFrom.split('-').map(Number);
              const since = new Date(sy, sm - 1, sd);
              if (postDate < since) return false;
            }
            return true;
          });

          filtered.sort((a, b) => {
            if (!a.post_date && !b.post_date) return 0;
            if (!a.post_date) return 1;
            if (!b.post_date) return -1;
            return new Date(b.post_date).getTime() - new Date(a.post_date).getTime();
          });
          const limit = parseInt(appliedLatestN) || 0;
          const displayPosts = limit > 0 ? filtered.slice(0, limit) : filtered;

          return (
            <>
              {/* 篩選器列 */}
              <div className="space-y-2 pt-1">
                {/* 平台篩選 */}
                {platforms.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {platforms.map((p) => {
                      const count = dateFiltered.filter((post) => post.platform === p).length;
                      return (
                        <button
                          key={p}
                          onClick={() => { setFilterPlatform(p); setFilterOwner(null); }}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activePlatform === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {p}（{count}）
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 擁有者篩選 */}
                {owners.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setFilterOwner(null)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!filterOwner ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      全部帳號
                    </button>
                    {owners.map((o) => (
                      <button
                        key={o}
                        onClick={() => setFilterOwner(o)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterOwner === o ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}

                {/* 日期篩選：某日之後 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 shrink-0">發佈日期在此之後</span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <button
                    type="button"
                    onClick={() => setAppliedDateFrom(dateFrom)}
                    disabled={dateFrom === appliedDateFrom}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    套用
                  </button>
                  {appliedDateFrom && (
                    <button type="button" onClick={() => { setDateFrom(''); setAppliedDateFrom(''); }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">清除</button>
                  )}
                </div>

                {/* 每平台最新 N 篇 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 shrink-0">每平台最新</span>
                  <input
                    type="number"
                    min="1"
                    value={latestN}
                    onChange={(e) => setLatestN(e.target.value)}
                    placeholder="全部"
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <span className="text-xs text-gray-400 shrink-0">篇</span>
                  <button
                    type="button"
                    onClick={() => setAppliedLatestN(latestN)}
                    disabled={latestN === appliedLatestN}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    套用
                  </button>
                  {appliedLatestN && (
                    <button type="button" onClick={() => { setLatestN(''); setAppliedLatestN(''); }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">清除</button>
                  )}
                </div>
              </div>
              <div className="grid pt-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {displayPosts.map((post) => {
              const embedUrl = getEmbedUrl(post.platform, post.post_url);
              const dateStr = post.post_date ? (() => {
                try { return new Date(post.post_date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
                catch { return post.post_date; }
              })() : null;

              // TikTok 獨立排版：大頭貼＋標題在上，iframe 置中留白
              if (post.platform === 'TikTok') {
                const tikEmbedUrl = getEmbedUrl('TikTok', post.post_url);
                return (
                  <div key={post.id} className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden flex flex-col">
                    {dateStr && (
                      <div className="flex items-center justify-center gap-2 px-4 pt-4">
                        <span className={`w-3 h-3 rounded-full shrink-0 ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-400'}`} />
                        <span className="text-sm font-semibold text-gray-600">{dateStr}</span>
                      </div>
                    )}
                    {/* 大頭貼 + 帳號 + 標題 */}
                    <div className="flex items-start gap-2.5 px-4 pt-3 pb-3">
                      <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-white text-xs font-bold">
                        {post.profile_pic_url ? (
                          <img src={post.profile_pic_url} alt="" className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (post.account?.[0] ?? '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{post.account ?? '—'}</p>
                        {post.content && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{post.content}</p>}
                      </div>
                      {post.post_url && (
                        <a href={post.post_url} target="_blank" rel="noreferrer" className="shrink-0 text-gray-300 hover:text-gray-600 transition-colors mt-0.5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                      )}
                    </div>
                    {/* iframe 置中留白 */}
                    <div className="flex justify-center px-4 pb-4">
                      {tikEmbedUrl ? (
                        <iframe
                          src={tikEmbedUrl}
                          className="w-full border-0 aspect-[9/16] rounded-xl"
                          allowFullScreen
                        />
                      ) : (
                        <p className="text-xs text-gray-300 py-6">無法載入影片</p>
                      )}
                    </div>
                  </div>
                );
              }

              // FB 圖片貼文（is_video=0）：不用 embed，避免文案重複
              const isFbImagePost = post.platform === 'FB' && post.is_video === 0;
              // Threads 一律用官方 blockquote embed，不走縮圖路徑
              const isThreadsWithImage = false;

              return (
                <div key={post.id} className="rounded-xl border border-gray-100 bg-gray-50/60 overflow-hidden flex flex-col">
                  {dateStr && (
                    <div className="flex items-center justify-center gap-2 px-3 pt-4">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${PLATFORM_COLORS[post.platform] ?? 'bg-gray-400'}`} />
                      <span className="text-sm font-semibold text-gray-600">{dateStr}</span>
                    </div>
                  )}
                  {/* 內嵌貼文 */}
                  {embedUrl && !isFbImagePost && !isThreadsWithImage ? (
                    post.platform === 'YT' ? (
                      <iframe
                        src={embedUrl}
                        className="w-full border-0 aspect-video"
                        allowFullScreen
                      />
                    ) : post.platform === 'FB' ? (
                      <div className="px-8 pt-5 pb-3">
                        <iframe
                          src={embedUrl}
                          className="w-full border-0 aspect-[9/16] rounded-lg"
                          allowFullScreen
                        />
                      </div>
                    ) : post.platform === 'IG' ? (
                      <div className="px-8 pt-5 pb-3">
                        <iframe
                          src={embedUrl}
                          className="w-full border-0 rounded-lg aspect-[4/5]"
                          scrolling="no"
                          allowFullScreen
                        />
                      </div>
                    ) : post.platform === 'Threads' ? (
                      <div className="px-8 pt-5 pb-3">
                        <iframe
                          src={embedUrl}
                          className="w-full border-0 rounded-lg"
                          style={{ height: '900px' }}
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <iframe
                        src={embedUrl}
                        className="w-full border-0"
                        style={{ height: '600px' }}
                        scrolling="no"
                        allowFullScreen
                      />
                    )
                  ) : (
                    <>
                      {/* 無內嵌：顯示頭像 + 帳號 */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <div className="relative w-8 h-8 rounded-full shrink-0 overflow-hidden bg-gradient-to-br from-purple-400 via-pink-400 to-orange-300 flex items-center justify-center text-white text-xs font-bold">
                          <span>{post.account?.[0] ?? '?'}</span>
                          {post.profile_pic_url && (
                            <img
                              src={post.platform === 'Threads' ? (proxyImg(post.profile_pic_url) ?? post.profile_pic_url) : post.profile_pic_url}
                              alt="" className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{post.account ?? '—'}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 shrink-0">{post.platform}</span>
                      </div>
                      {/* Threads 影片 */}
                      {post.platform === 'Threads' && post.video_url && (
                        <video
                          src={proxyImg(post.video_url) ?? post.video_url}
                          className="w-full object-cover"
                          controls
                          playsInline
                          preload="metadata"
                        />
                      )}
                      {/* FB 圖片貼文 or Threads 有縮圖（無影片）：顯示縮圖 */}
                      {(isFbImagePost || (isThreadsWithImage && !post.video_url)) && post.thumbnail && (
                        <img
                          src={post.platform === 'Threads' ? (proxyImg(post.thumbnail) ?? post.thumbnail) : post.thumbnail}
                          alt="" className="w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      )}
                    </>
                  )}

                  {/* 互動數 */}
                  <div className="flex items-center gap-3 px-3 pt-2.5 text-sm">
                    {post.likes != null && (
                      <span className="flex items-center gap-1 text-gray-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                        {post.likes.toLocaleString()}
                      </span>
                    )}
                    {post.comments != null && (
                      <span className="flex items-center gap-1 text-gray-700">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        {post.comments.toLocaleString()}
                      </span>
                    )}
                    {post.post_url && (
                      <a href={post.post_url} target="_blank" rel="noreferrer" className="ml-auto text-gray-400 hover:text-gray-700 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                  </div>

                  {/* 內文：Threads 有 embed 才隱藏（embed 已含內容）；無 embed（新格式無 post_url）正常顯示 */}
                  {!(post.platform === 'Threads' && !!embedUrl) && (
                    <div className="px-3 pb-3 pt-1.5 space-y-1 flex-1">
                      {post.platform === 'YT' ? (
                        post.content && (
                          <p className="text-sm text-gray-700 line-clamp-3">{post.content}</p>
                        )
                      ) : (
                        post.content && (
                          <p className="text-sm text-gray-800 line-clamp-3">
                            <span className="font-semibold mr-1">{post.account}</span>
                            {post.content}
                          </p>
                        )
                      )}
                      {post.hashtags && (
                        <p className="text-xs text-blue-500 line-clamp-2">{post.hashtags}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
              </div>
            </>
          );
        })()}

        {latestJob && latestJob.posts.length === 0 && !activeJobId && (
          <p className="text-sm text-gray-300">此次抓取無貼文資料。</p>
        )}
      </div>
    </div>
  );
}
