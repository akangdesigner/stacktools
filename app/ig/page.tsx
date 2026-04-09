'use client';

import { useEffect, useState } from 'react';

interface Post {
  publishedAt:  string;
  owner:        string;
  coauthors:    string;
  avatarUrl:    string;
  type:         string;
  content:      string;
  comment:      string;
  likes:        number;
  commentCount: number;
  views:        number;
  originalUrl:  string;
  plays:        number;
  duration:     string;
}

function PostCard({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const shortContent = post.content.length > 120 ? post.content.slice(0, 120) + '...' : post.content;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 text-sm">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {post.avatarUrl && !imgError ? (
            <img
              src={`/api/avatar?url=${encodeURIComponent(post.avatarUrl)}`}
              alt={post.owner}
              className="w-8 h-8 rounded-full object-cover shrink-0"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {post.owner.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-900">{post.owner}</div>
            <div className="text-xs text-gray-400">{post.publishedAt}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {post.type && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{post.type}</span>
          )}
          {post.coauthors && (
            <span className="text-xs text-gray-400">合作：{post.coauthors}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
        {expanded ? post.content : shortContent}
        {post.content.length > 120 && (
          <button onClick={() => setExpanded(!expanded)} className="ml-1 text-purple-400 hover:underline text-xs">
            {expanded ? '收起' : '展開'}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '❤️ 愛心', value: post.likes },
          { label: '💬 留言', value: post.commentCount },
          { label: '👁 觀看', value: post.views },
          { label: '▶️ 播放', value: post.plays },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center py-2 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-400">{label}</span>
            <span className="text-sm font-semibold text-gray-800">{value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* 影片長度 */}
      {post.duration && post.duration !== '0' && (
        <div className="text-xs text-gray-500">⏱ 影片長度：{post.duration}</div>
      )}

      {/* 精選留言 */}
      {post.comment && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 leading-relaxed">
          <span className="font-medium text-gray-500 block mb-1">💬 精選留言</span>
          {post.comment}
        </div>
      )}

      {/* 原始貼文網址 */}
      {post.originalUrl && post.originalUrl !== '（無）' && (
        <div className="pt-1 border-t border-gray-100">
          <a href={post.originalUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline">📎 查看原始貼文 ↗</a>
        </div>
      )}

    </div>
  );
}

interface Account {
  url: string;
  name: string;
  avatar: string;
}

function TrackList({ avatarMap: externalAvatarMap }: { avatarMap: Record<string, string> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [ownersAvatarMap, setOwnersAvatarMap] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    Promise.all([
      fetch('/api/ig-tracklist').then(r => r.json()),
      fetch('/api/ig-avatars').then(r => r.json()),
    ]).then(([trackData, avatarData]) => {
      setAccounts(trackData.accounts ?? []);
      setOwnersAvatarMap(avatarData ?? {});
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(url: string) {
    if (!window.confirm(`確定要移除追蹤「${url}」嗎？`)) return;
    setDeletingUrl(url);
    try {
      const res = await fetch('/api/ig-track', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success) {
        load();
      } else {
        alert(data.error || '刪除失敗，請稍後再試');
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-gray-600 transition-colors"
        >
          <span>目前追蹤名單</span>
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={() => { if (open) load(); else { setOpen(true); } }}
          className="text-xs text-gray-400 hover:text-purple-500 transition-colors"
          title="重新整理"
        >
          ↻ 重新整理
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-4 pt-3">
          {loading ? (
            <p className="text-xs text-gray-400">載入中...</p>
          ) : accounts.length === 0 ? (
            <p className="text-xs text-gray-400">尚無追蹤帳號</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accounts.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-purple-50 hover:border-purple-300 transition-colors group"
                >
                  {(() => {
                    const raw = externalAvatarMap[a.name]
                      ?? Object.entries(ownersAvatarMap).find(([owner]) => fuzzyMatch(owner, a.name))?.[1];
                    if (!raw) return null;
                    return (
                      <img
                        src={`/api/avatar?url=${encodeURIComponent(raw)}`}
                        alt={a.name}
                        className="w-5 h-5 rounded-full object-cover shrink-0"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    );
                  })()}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-700 hover:underline"
                  >
                    {a.name || a.url}
                  </a>
                  <button
                    onClick={() => handleDelete(a.url)}
                    disabled={deletingUrl === a.url}
                    title="移除追蹤"
                    className="ml-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 text-xs leading-none"
                  >
                    {deletingUrl === a.url ? '…' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrackForm() {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/ig-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setMessage('已成功加入追蹤清單！');
        setUrl('');
        setName('');
      } else {
        setStatus('error');
        setMessage(data.error || '寫入失敗，請稍後再試');
      }
    } catch (err) {
      setStatus('error');
      setMessage(String(err));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="font-semibold text-gray-800 mb-3 text-sm">新增追蹤帳號</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">IG 網址</label>
          <input
            type="url"
            placeholder="https://www.instagram.com/帳號名稱/"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-72"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">顯示名稱（選填）</label>
          <input
            type="text"
            placeholder="例：樂樂"
            value={name}
            onChange={e => setName(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-36"
          />
        </div>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {status === 'loading' ? '處理中...' : '確認追蹤'}
        </button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
          {message}
        </p>
      )}
    </div>
  );
}



function charOverlap(a: string, b: string): number {
  const sa = new Set(a), sb = new Set(b);
  const common = [...sa].filter(c => sb.has(c)).length;
  return common / Math.min(sa.size, sb.size);
}

function fuzzyMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const segments = y.split(/[｜|、，,\s]+/).filter(s => s.length >= 2);
  return segments.some(seg =>
    x === seg || x.includes(seg) || seg.includes(x) || charOverlap(x, seg) >= 0.6
  );
}

export default function IGPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('全部');
  const [sinceDate, setSinceDate] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'likes' | 'comments' | 'views' | 'plays'>('time');
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg('');
    setCountdown(null);
    try {
      const res = await fetch('/api/ig-n8n-trigger', { method: 'POST' });
      const data = await res.json();
      if (res.ok && !data.error) {
        // 開始倒數 60 秒，結束後自動產生報告
        const TOTAL = 60;
        setCountdown(TOTAL);
        let remaining = TOTAL;
        const timer = setInterval(() => {
          remaining -= 1;
          setCountdown(remaining);
          if (remaining <= 0) {
            clearInterval(timer);
            setCountdown(null);
            setTriggerMsg('同步完成，自動載入最新報告...');
            handleGenerate();
          }
        }, 1000);
      } else {
        setTriggerMsg(data.error || '觸發失敗，請稍後再試');
      }
    } catch (e) {
      setTriggerMsg(String(e));
    } finally {
      setTriggering(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setGenerated(false);
    try {
      const [reportRes, trackRes] = await Promise.all([
        fetch('/api/ig-report'),
        fetch('/api/ig-tracklist'),
      ]);
      const reportData = await reportRes.json();
      const trackData = await trackRes.json();

      if (reportData.error) {
        setError(reportData.error);
      } else {
        const posts = (reportData.posts ?? []) as Post[];
        const accounts = (trackData?.accounts ?? []) as Account[];

        // owner → raw avatarUrl
        const ownerAvatar: Record<string, string> = {};
        for (const p of posts) {
          if (p.owner && p.avatarUrl && !ownerAvatar[p.owner])
            ownerAvatar[p.owner] = p.avatarUrl;
        }
        // account name → raw avatar URL via fuzzy match to owner
        const map: Record<string, string> = {};
        for (const acc of accounts) {
          const matched = Object.keys(ownerAvatar).find(owner => fuzzyMatch(owner, acc.name));
          if (matched) map[acc.name] = ownerAvatar[matched];
        }
        setAvatarMap(map);
        setPosts(posts);
        setGenerated(true);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const owners = ['全部', ...Array.from(new Set(posts.map(p => p.owner))).filter(Boolean)];

  const filtered = posts.filter(p => {
    const matchOwner = selectedOwner === '全部' || p.owner === selectedOwner;
    const matchDate = !sinceDate || !p.publishedAt || (() => {
      // publishedAt 格式：2026/2/26 0:57:40 → 取日期部分比對
      const datePart = p.publishedAt.split(' ')[0]; // '2026/2/26'
      const [y, m, d] = datePart.split('/').map(Number);
      const postDate = new Date(y, m - 1, d);
      const [sy, sm, sd] = sinceDate.split('-').map(Number);
      const since = new Date(sy, sm - 1, sd);
      return postDate >= since;
    })();
    return matchOwner && matchDate;
  }).sort((a, b) => {
    if (sortBy === 'time') {
      return new Date(b.publishedAt.replace(/\//g, '-')).getTime() - new Date(a.publishedAt.replace(/\//g, '-')).getTime();
    }
    const key: Record<Exclude<typeof sortBy, 'time'>, keyof Post> = {
      likes: 'likes', comments: 'commentCount', views: 'views', plays: 'plays',
    };
    return (b[key[sortBy as Exclude<typeof sortBy, 'time'>]] as number) - (a[key[sortBy as Exclude<typeof sortBy, 'time'>]] as number);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">IG 監控報告</h1>
        <p className="text-gray-500 mt-1 text-sm">追蹤帳號近期貼文成效</p>
      </div>

      {/* Track Form */}
      <TrackForm />

      {/* Track List */}
      <TrackList avatarMap={avatarMap} />

      {/* 產生報告 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-1 text-sm">產生貼文報告</h2>
        <p className="text-xs text-gray-400 mb-3">
          每天早上 11 點會自動更新追蹤名單與貼文。若需立即更新，可點「重新抓取貼文」（約 1 分鐘），完成後會自動載入報告。
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">發佈日期在此之後</label>
            <input
              type="date"
              value={sinceDate}
              onChange={e => setSinceDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <button
            onClick={handleTrigger}
            disabled={triggering || countdown !== null}
            className="px-5 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {triggering ? '觸發中...' : countdown !== null ? `抓取中 ${countdown}s...` : '重新抓取貼文'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || countdown !== null}
            className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '載入中...' : '產生報告'}
          </button>
        </div>
        {triggerMsg && (
          <p className={`mt-2 text-xs ${triggerMsg.includes('失敗') || triggerMsg.includes('error') || triggerMsg.includes('未設定') ? 'text-red-500' : 'text-green-600'}`}>
            {triggerMsg}
          </p>
        )}
      </div>

      {/* Filters — 只在有資料後顯示 */}
      {generated && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* 帳號篩選 */}
          <div className="flex gap-2 flex-wrap">
            {owners.map(owner => (
              <button
                key={owner}
                onClick={() => setSelectedOwner(owner)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedOwner === owner
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {owner}
              </button>
            ))}
          </div>

          {/* 排序 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">排序</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="time">最新時間</option>
              <option value="likes">愛心數</option>
              <option value="comments">留言數</option>
              <option value="views">觀看數</option>
              <option value="plays">播放次數</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-4 text-sm">{error}</div>
      )}
      {!generated && !loading && !error && (
        <div className="text-center py-20 text-gray-300 text-sm">選擇日期後按「產生報告」</div>
      )}
      {generated && !loading && !error && (
        <>
          <p className="text-xs text-gray-400 mb-4">共 {filtered.length} 則貼文{sinceDate ? `（${sinceDate} 之後）` : ''}</p>
          <div className="flex flex-col gap-4">
            {filtered.map((post, i) => (
              <PostCard key={i} post={post} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-20 text-gray-400 text-sm">沒有符合條件的貼文</div>
          )}
        </>
      )}
    </div>
  );
}
