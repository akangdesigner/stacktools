'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 社群海巡留言 LIFF：一開頁就自動掃 Threads＋FB 社團熱門話題，AI 幫每篇寫建議留言。
// 跟節慶/部落格改寫/時事不同：這是「候選清單」不是「單篇編輯」——沒有改文/改圖/確認發佈，
// 只有「前往原文」＋「複製留言」，使用者自己去原地留言。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_SOCIAL_MONITOR || '';

type Phase = 'init' | 'pick' | 'loading' | 'ready' | 'error';

const MAX_KEYWORDS = 3;

type Item = {
  source: 'threads' | 'facebook';
  content: string;
  url: string;
  publishTime: string;
  likeCount: number;
  replyCount: number;
  suggestedComment: string;
};

type SortBy = 'relevant' | 'likes' | 'replies';

// 排序選項（最相關＝沿用 n8n 回傳的 AI 相關性原順序，不再重排）
const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'relevant', label: '最相關' },
  { key: 'likes', label: '最多讚' },
  { key: 'replies', label: '留言最高' },
];

// 總共顯示則數選項
const LIMIT_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 則' },
  { value: 10, label: '10 則' },
  { value: 20, label: '20 則' },
];

const PROGRESS_CAP = 95;
const PROGRESS_TAU_MS = 100_000; // Threads+FB 雙路掃描＋評分，抓長一點

function formatCount(n: number): string {
  if (!n || n <= 0) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function SocialMonitorLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [progress, setProgress] = useState(0);
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]); // 客戶產業關鍵字（可選項）
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]); // 用戶複選（最多 3）
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('relevant'); // 排序標準：最相關/最多讚/最多留言
  const [limit, setLimit] = useState<number>(10); // 每個來源顯示上限，0=全部
  const [error, setError] = useState('');
  const liffRef = useRef<Liff | null>(null);
  const runStartRef = useRef<number>(0);

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (phase !== 'loading') return;
    const id = setInterval(() => {
      const start = runStartRef.current || Date.now();
      const elapsed = Date.now() - start;
      const target = PROGRESS_CAP * (1 - Math.exp(-elapsed / PROGRESS_TAU_MS));
      setProgress((p) => (target > p ? target : p));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_SOCIAL_MONITOR 環境變數');
          const liff = (await import('@line/liff')).default;
          liffRef.current = liff;
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) {
            liff.login();
            return;
          }
          const profile = await liff.getProfile();
          resolvedUid = profile.userId;
        }
        if (cancelled) return;
        setUid(resolvedUid);
        // 先查客戶的產業關鍵字讓用戶複選，選完才開始海巡
        const kRes = await fetch('/api/liff-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line_uid: resolvedUid }),
        });
        const kData = await kRes.json();
        if (!kRes.ok) throw new Error(kData.error || `HTTP ${kRes.status}`);
        if (cancelled) return;
        setKeywords(kData.keywords || []);
        setCustomerName(kData.customerName || '');
        setPhase('pick');
      } catch (e) {
        if (!cancelled) {
          setError(`初始化失敗：${msg(e)}`);
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runScan(lineUid: string) {
    setError('');
    setProgress(0);
    runStartRef.current = Date.now();
    setPhase('loading');

    try {
      // ① 送出掃描任務（立刻回 jobId，避開 Cloudflare 對長請求的 100 秒切斷）
      const startRes = await fetch('/api/liff-social-monitor/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: lineUid, selected_keywords: selectedKeywords }),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || `HTTP ${startRes.status}`);
      }
      const jobId = startData.jobId as string;

      // ② 每 4 秒輪詢一次，最多等 8 分鐘
      const deadline = Date.now() + 8 * 60 * 1000;
      while (true) {
        await new Promise((r) => setTimeout(r, 4000));
        const pr = await fetch(`/api/liff-social-monitor/generate?jobId=${encodeURIComponent(jobId)}`);
        let pd: { status?: string; items?: Item[]; customerName?: string; error?: string };
        try {
          pd = await pr.json();
        } catch {
          if (Date.now() > deadline) throw new Error('掃描等待逾時，請重試');
          continue; // 暫時性非 JSON 回應 → 繼續輪詢
        }
        if (pd.status === 'done') {
          setItems(Array.isArray(pd.items) ? pd.items : []);
          setCustomerName(pd.customerName || '');
          setProgress(100);
          setPhase('ready');
          return;
        }
        if (pd.status === 'error') throw new Error(pd.error || '掃描失敗');
        if (Date.now() > deadline) throw new Error('掃描等待逾時，請重試');
      }
    } catch (e) {
      setError(`掃描失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  async function copyComment(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
    } catch {
      // clipboard 權限被擋時，退而求其次不做任何事（按鈕文字仍會提示使用者手動選取）
    }
  }

  // 全部來源一起依選定排序，取前 N 則（總數上限），再依來源分區顯示
  const arranged = (() => {
    const arr = [...items];
    if (sortBy === 'likes') arr.sort((a, b) => b.likeCount - a.likeCount);
    else if (sortBy === 'replies') arr.sort((a, b) => b.replyCount - a.replyCount);
    // relevant 沿用 n8n 原順序，不重排
    return limit > 0 ? arr.slice(0, limit) : arr;
  })();

  const allThreads = items.filter((i) => i.source === 'threads'); // 供 stat 計總數
  const allFb = items.filter((i) => i.source === 'facebook');
  const threadsItems = arranged.filter((i) => i.source === 'threads');
  const fbItems = arranged.filter((i) => i.source === 'facebook');
  const topItem = arranged[0]; // 排序後整體第一則，🔥最推薦掛這裡（不分區）

  return (
    <Shell center={phase === 'init' || phase === 'loading'}>
      {phase === 'pick' && (
        <>
          <header className="head">
            <div className="mark">📌</div>
            <div className="eyebrow">Social Listening Studio</div>
            <h1 className="title">社群海巡留言</h1>
            <p className="sub">選 1～3 個關鍵字，AI 幫你海巡相關熱門貼文</p>
          </header>

          {error && <div className="err">{error}</div>}

          <section className="card">
            <div className="card-pad">
              <div className="kw-hint">最多選 {MAX_KEYWORDS} 個（已選 {selectedKeywords.length}）</div>
              {keywords.length === 0 ? (
                <p className="kw-empty">你的客戶資料還沒設定產業關鍵字，請先到「客戶資料設定」補上。</p>
              ) : (
                <div className="kw-wrap">
                  {keywords.map((k) => {
                    const on = selectedKeywords.includes(k);
                    return (
                      <button
                        key={k}
                        className={`kw-chip${on ? ' on' : ''}`}
                        onClick={() =>
                          setSelectedKeywords((prev) =>
                            prev.includes(k)
                              ? prev.filter((x) => x !== k)
                              : prev.length >= MAX_KEYWORDS
                                ? prev
                                : [...prev, k]
                          )
                        }
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <button className="confirm" onClick={() => uid && runScan(uid)} disabled={selectedKeywords.length === 0}>
            開始海巡
          </button>
        </>
      )}

      {(phase === 'init' || phase === 'loading') && (
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">📌</div>
            <div className="eyebrow eyebrow-muted">{phase === 'init' ? 'Connecting' : 'Scanning'}</div>
            <h2 className="loading-h">正在幫你掃描熱門話題</h2>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="prog-meta">
              <span className="st">AI 掃描 Threads＋FB 社團＋評分中…</span>
              <span className="pc">{Math.round(progress)}%</span>
            </div>
            <p className="waited">請耐心等，別關閉頁面</p>
          </div>
        </section>
      )}

      {phase === 'error' && (
        <>
          <header className="head">
            <div className="mark">📌</div>
            <div className="eyebrow">Social Listening Studio</div>
            <h1 className="title">社群海巡留言</h1>
          </header>
          <div className="err">{error}</div>
          <button className="confirm" onClick={() => uid && runScan(uid)}>
            ↻ 重新掃描
          </button>
        </>
      )}

      {phase === 'ready' && (
        <>
          <header className="head">
            <div className="mark">📌</div>
            <div className="eyebrow">Social Listening Studio</div>
            <h1 className="title">社群海巡留言</h1>
            <p className="sub">AI 幫你找到適合留言的熱門貼文</p>
            {customerName && (
              <div className="tab">
                <span className="dot" />
                <span className="zh">{customerName}</span>
                <span className="en">Social Listening</span>
              </div>
            )}
          </header>

          {error && <div className="err">{error}</div>}

          <div className="stat-row">
            <div className="stat">
              <div className="num">{items.length}</div>
              <div className="lbl">候選貼文</div>
            </div>
            <div className="stat">
              <div className="num">{allThreads.length}</div>
              <div className="lbl">Threads</div>
            </div>
            <div className="stat">
              <div className="num">{allFb.length}</div>
              <div className="lbl">FB 社團</div>
            </div>
          </div>

          {items.length > 0 && (
            <div className="toolbar">
              <div className="tb-group">
                <span className="tb-lbl">排序</span>
                <div className="tb-chips">
                  {SORT_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      className={`tb-chip${sortBy === o.key ? ' on' : ''}`}
                      onClick={() => setSortBy(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tb-group">
                <span className="tb-lbl">則數</span>
                <div className="tb-chips">
                  {LIMIT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`tb-chip${limit === o.value ? ' on' : ''}`}
                      onClick={() => setLimit(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="card">
              <div className="card-pad" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>這次沒掃到適合留言的貼文，稍後再試試看。</p>
              </div>
            </div>
          )}

          {threadsItems.length > 0 && (
            <>
              <div className="sec-title">
                <span className="txt">Threads · 熱門話題</span>
                <span className="ln" />
              </div>
              {threadsItems.map((it, i) => (
                <PostCard key={`t-${i}`} item={it} idx={i} copied={copiedIdx === items.indexOf(it)} onCopy={() => copyComment(it.suggestedComment, items.indexOf(it))} top={it === topItem} />
              ))}
            </>
          )}

          {fbItems.length > 0 && (
            <>
              <div className="sec-title">
                <span className="txt">Facebook 社團</span>
                <span className="ln" />
              </div>
              {fbItems.map((it, i) => (
                <PostCard key={`f-${i}`} item={it} idx={i} copied={copiedIdx === items.indexOf(it)} onCopy={() => copyComment(it.suggestedComment, items.indexOf(it))} top={it === topItem} />
              ))}
            </>
          )}

          <div className="refresh-row">
            <button className="relink" onClick={() => uid && runScan(uid)}>
              ↻ 重新掃描
            </button>
            <p className="hint">{'// 每次開啟即時重新掃描，不留舊資料'}</p>
          </div>
        </>
      )}
    </Shell>
  );
}

function PostCard({
  item,
  copied,
  onCopy,
  top = false,
}: {
  item: Item;
  idx: number;
  copied: boolean;
  onCopy: () => void;
  top?: boolean;
}) {
  return (
    <div className={`post-card${top ? ' top' : ''}`}>
      {top && <span className="post-top">🔥 最推薦</span>}
      <div className="post-head">
        <span className={`src ${item.source === 'threads' ? 'threads' : 'fb'}`}>
          <span className="ic">
            {item.source === 'threads' ? (
              <svg viewBox="0 0 24 24" width="11" height="11" fill="#fff">
                <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="12" height="12" fill="#fff">
                <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
              </svg>
            )}
          </span>
          <span className="name">{item.source === 'threads' ? 'Threads' : 'Facebook'}</span>
        </span>
        <span className="heat">
          ❤️ <b>{formatCount(item.likeCount)}</b> 💬 <b>{formatCount(item.replyCount)}</b>
        </span>
      </div>
      <p className="post-body">{item.content}</p>
      {item.publishTime && <p className="post-meta">📅 {item.publishTime}</p>}
      <div className="suggest-box">
        <p className="lbl">建議留言</p>
        <p className="txt">{item.suggestedComment}</p>
      </div>
      <div className="post-actions">
        <a className="btn ghost" href={item.url} target="_blank" rel="noopener noreferrer">
          🔗 前往原文
        </a>
        <button className={`btn ${copied ? 'copied' : 'primary'}`} onClick={onCopy}>
          {copied ? '✓ 已複製' : '📋 複製留言'}
        </button>
      </div>
    </div>
  );
}

function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true">
        <div className="grid" />
      </div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

const FP_CSS = `
.fp {
  --card: #FFFFFF;
  --line: rgba(43,92,230,.14);
  --line-2: rgba(43,92,230,.24);
  --ink: #1D2942;
  --ink-2: #5C6A85;
  --ink-3: #94A0B8;
  --blue: #2B5CE6;
  --blue-deep: #1E48C8;
  --blue-soft: #EAF0FE;
  --green: #23AE6E;
  --green-soft: #E9F7F0;
  --glow: rgba(43,92,230,.38);
  --field: #F2F5FC;
  --thread: #000000;
  --fb: #1877F2;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --mono: "SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace;
  --chamfer: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  position: relative; min-height: 100vh; overflow: hidden;
  font-family: var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased;
  padding: 22px 0 44px;
  background:
    radial-gradient(680px 340px at 86% -6%, rgba(43,92,230,.16) 0%, transparent 60%),
    radial-gradient(560px 360px at -10% 14%, rgba(35,174,110,.10) 0%, transparent 58%),
    linear-gradient(180deg, #EEF3FD 0%, #D9E4F7 100%);
}
.fp * { box-sizing: border-box; }
.fp .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.fp .fx .grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(43,92,230,.12) 1px, transparent 1px);
  background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(circle at 50% 14%, #000 0%, transparent 68%);
          mask-image: radial-gradient(circle at 50% 14%, #000 0%, transparent 68%);
}
.fp .wrap { position: relative; z-index: 1; width: 100%; max-width: 420px; margin: 0 auto; padding: 0 16px; }
.fp .wrap-center { min-height: 82vh; display: flex; flex-direction: column; justify-content: center; }

.fp .head { text-align: center; margin: 6px 0 18px; }
.fp .mark {
  width: 56px; height: 56px; margin: 0 auto 13px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; font-size: 26px;
  background: linear-gradient(150deg, #FFFFFF, #E7EEFE);
  border: 1px solid rgba(43,92,230,.28);
  box-shadow: 0 10px 24px -8px var(--glow), inset 0 1px 0 rgba(255,255,255,.9);
}
.fp .eyebrow { font-family: var(--mono); font-size: 10.5px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--blue); }
.fp .eyebrow-muted { color: var(--ink-3); }
.fp .title { font-size: 24px; font-weight: 900; letter-spacing: .04em; margin: 7px 0 0; color: var(--ink); }
.fp .sub { font-size: 11.5px; color: var(--ink-2); margin-top: 7px; letter-spacing: .02em; }
.fp .tab {
  display: inline-flex; align-items: center; gap: 7px; clip-path: var(--chamfer);
  background: rgba(255,255,255,.72); border: 1px solid var(--line-2);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); padding: 6px 14px; margin-top: 12px;
}
.fp .tab .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--green); box-shadow: 0 0 8px 1px rgba(35,174,110,.55); }
.fp .tab .zh { font-size: 11px; font-weight: 800; color: var(--ink); }
.fp .tab .en { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }

.fp .card {
  position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 18px; margin-bottom: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 22px 44px -28px rgba(30,60,120,.45);
}
.fp .card-pad { padding: 16px 16px 18px; }
.fp .loading-card { text-align: center; }
.fp .loading-h { font-size: 16px; font-weight: 900; color: var(--ink); margin: 5px 0 20px; letter-spacing: .02em; }
.fp .prog-track { height: 7px; border-radius: 999px; background: #DDE6F6; overflow: hidden; margin: 2px 0 0; border: 1px solid var(--line); }
.fp .prog-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--blue-deep), #5B87F2); box-shadow: 0 0 12px 0 var(--glow); transition: width .5s ease-out; }
.fp .prog-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-top: 10px; }
.fp .prog-meta .st { flex: 1; text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: .05em; color: var(--ink-2); line-height: 1.5; }
.fp .prog-meta .pc { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--blue); }
.fp .waited { font-family: var(--mono); font-size: 10.5px; color: var(--ink-2); margin-top: 18px; letter-spacing: .05em; text-align: center; }

.fp .err {
  margin-bottom: 14px; border-radius: 12px; background: #FEF2F2; border: 1px solid #FBD5D5;
  padding: 12px 14px; font-size: 13px; color: #B42318; line-height: 1.6;
}
.fp .kw-hint { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); margin: 0 0 12px; letter-spacing: .04em; }
.fp .kw-empty { font-size: 12.5px; color: var(--ink-2); line-height: 1.7; }
.fp .kw-wrap { display: flex; flex-wrap: wrap; gap: 9px; }
.fp .kw-chip {
  border: 1px solid var(--line-2); background: var(--field); color: var(--ink-2);
  font-family: var(--sans); font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 999px;
  cursor: pointer; transition: all .15s;
}
.fp .kw-chip.on {
  background: linear-gradient(135deg, var(--blue), var(--blue-deep)); color: #fff; border-color: transparent;
  box-shadow: 0 6px 16px -6px var(--glow);
}
.fp .confirm {
  position: relative; width: 100%; border: 0; cursor: pointer; color: #FFFFFF;
  font-family: var(--sans); font-size: 15px; font-weight: 800; letter-spacing: .04em;
  padding: 15px; border-radius: 14px; margin-top: 2px;
  background: linear-gradient(135deg, var(--blue), var(--blue-deep));
  box-shadow: 0 14px 28px -12px var(--glow), inset 0 1px 0 rgba(255,255,255,.3);
}

.fp .stat-row { display: flex; gap: 10px; margin: 4px 0 16px; }
.fp .stat {
  flex: 1; background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 12px 10px; text-align: center;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 14px 28px -20px rgba(30,60,120,.4);
}
.fp .stat .num { font-family: var(--mono); font-size: 20px; font-weight: 800; color: var(--blue-deep); }
.fp .stat .lbl { font-size: 10px; color: var(--ink-3); margin-top: 2px; font-weight: 700; letter-spacing: .04em; }

.fp .toolbar {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 12px 13px; margin: 0 0 16px; display: flex; flex-direction: column; gap: 11px;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 14px 28px -22px rgba(30,60,120,.4);
}
.fp .tb-group { display: flex; align-items: center; gap: 10px; }
.fp .tb-lbl {
  flex: 0 0 auto; width: 30px; font-family: var(--mono); font-size: 10px; font-weight: 700;
  letter-spacing: .1em; color: var(--ink-3);
}
.fp .tb-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.fp .tb-chip {
  border: 1px solid var(--line-2); background: var(--field); color: var(--ink-2);
  font-family: var(--sans); font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
  cursor: pointer; transition: all .15s;
}
.fp .tb-chip.on {
  background: linear-gradient(135deg, var(--blue), var(--blue-deep)); color: #fff; border-color: transparent;
  box-shadow: 0 5px 13px -6px var(--glow);
}

.fp .sec-title { display: flex; align-items: center; gap: 8px; margin: 20px 2px 10px; }
.fp .sec-title .txt { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
.fp .sec-title .ln { flex: 1; height: 1px; background: var(--line); }

.fp .post-card {
  position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px; margin-bottom: 12px;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 18px 36px -26px rgba(30,60,120,.42);
  padding: 14px;
}
.fp .post-card.top { border-color: rgba(231,154,42,.4); }
.fp .post-top {
  position: absolute; top: -9px; left: 14px; font-family: var(--mono); font-size: 9px; font-weight: 700;
  letter-spacing: .08em; color: #fff; background: linear-gradient(135deg,#F0A020,#D9840F);
  padding: 3px 9px; border-radius: 999px; box-shadow: 0 4px 10px -3px rgba(240,160,32,.6);
}
.fp .post-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
.fp .src { display: inline-flex; align-items: center; gap: 6px; }
.fp .src .ic { width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
.fp .src.threads .ic { background: var(--thread); }
.fp .src.fb .ic { background: var(--fb); }
.fp .src .name { font-size: 11px; font-weight: 800; color: var(--ink); }
.fp .heat { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
.fp .heat b { color: var(--blue-deep); font-weight: 700; }
.fp .post-body { font-size: 12.5px; line-height: 1.7; color: #4E5568; margin: 0 0 11px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.fp .post-meta { font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); margin: -6px 0 11px; }
.fp .suggest-box { background: var(--blue-soft); border: 1px solid rgba(43,92,230,.2); border-radius: 12px; padding: 10px 12px; margin-bottom: 11px; }
.fp .suggest-box .lbl { font-family: var(--mono); font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--blue); margin-bottom: 5px; }
.fp .suggest-box .txt { font-size: 12.5px; line-height: 1.65; color: var(--ink); margin: 0; }
.fp .post-actions { display: flex; gap: 8px; }
.fp .btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 0; cursor: pointer; font-family: var(--sans); font-size: 12px; font-weight: 700;
  padding: 9px 10px; border-radius: 10px; transition: transform .1s; text-decoration: none;
}
.fp .btn:active { transform: scale(.96); }
.fp .btn.primary { color: #fff; background: linear-gradient(135deg, var(--blue), var(--blue-deep)); box-shadow: 0 6px 14px -6px var(--glow); }
.fp .btn.ghost { color: var(--blue-deep); background: var(--field); border: 1px solid var(--line); }
.fp .btn.copied { background: var(--green-soft); color: var(--green); border: 1px solid rgba(35,174,110,.3); }

.fp .refresh-row { text-align: center; margin-top: 20px; }
.fp .relink { border: 0; background: transparent; cursor: pointer; font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--blue); }
.fp .hint { font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); margin: 8px 2px 0; letter-spacing: .03em; }
`;
