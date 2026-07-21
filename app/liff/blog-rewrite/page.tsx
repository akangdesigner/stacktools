'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 部落格文章改寫 LIFF：進場先「讀取文章清單」→ 預覽要改寫的原文（預設最新一篇，可換舊文）→
// 小編確認後才「AI 依品牌人設改寫」，過程顯示進度條。圖片沿用原文章的 OG 圖，唯讀不可改。
// 視覺套 STACK AI 品牌色，與節慶頁一致（樣式 scoped 在 .fp 底下，見 FP_CSS）。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_BLOGREWRITE || '';

type Phase = 'init' | 'preview' | 'picklist' | 'rewriting' | 'ready' | 'done' | 'error';

// 進度條：改寫比生圖快很多（抓文章+AI 改寫，約 10~30 秒），TAU 抓短一點。
const PROGRESS_CAP = 95;
const PROGRESS_TAU_MS = 12_000;

type Article = { id: number; title: string; url: string };
type Preview = { title: string; imageUrl: string; summary: string };

export default function BlogRewriteLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [progress, setProgress] = useState(0);
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');

  // 文章清單、選定要改的那篇、原文預覽
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');

  const [textAdjust, setTextAdjust] = useState(''); // 定向改文案的需求文字
  const [rewriteLoading, setRewriteLoading] = useState(false); // AI 改文案中
  const [confirmLoading, setConfirmLoading] = useState(false);
  // 這次要發到哪些平台（發文前自己勾；預設全開，沒設 token 的平台就算勾了 n8n 也會跳過）
  const [platforms, setPlatforms] = useState<{ ig: boolean; fb: boolean; threads: boolean }>({
    ig: true,
    fb: true,
    threads: true,
  });
  const [error, setError] = useState('');
  const liffRef = useRef<Liff | null>(null);
  const runStartRef = useRef<number>(0);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // ── 內文框自動撐高：完整顯示全文，不要內部滑動 ──
  // 依賴要含 phase：content 在改寫階段就設好，但 textarea 要到 phase='ready' 才 render，
  // 若只依賴 content，撐高會在 textarea 還沒 mount 時就跑掉、之後不再觸發 → 框卡在一行高、文字被截。
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content, phase]);

  // ── 進度條：依「經過時間」漸近爬向 95%（單調遞增，不倒退）──
  useEffect(() => {
    if (phase !== 'rewriting') return;
    const id = setInterval(() => {
      const start = runStartRef.current || Date.now();
      const elapsed = Date.now() - start;
      const target = PROGRESS_CAP * (1 - Math.exp(-elapsed / PROGRESS_TAU_MS));
      setProgress((p) => (target > p ? target : p));
    }, 300);
    return () => clearInterval(id);
  }, [phase]);

  // ── 啟動：liff init → 取 uid → 讀文章清單（不再一進來就改寫）─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_BLOGREWRITE 環境變數');
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
        await loadArticles(resolvedUid);
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

  // ── 讀客戶的文章清單 → 預設預覽最新一篇 ──────────────────────
  async function loadArticles(lineUid: string) {
    setError('');
    setPhase('init');
    try {
      const res = await fetch('/api/liff-blogrewrite/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: lineUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCustomerName(data.customerName || '');
      const list: Article[] = data.articles || [];
      setArticles(list);
      if (!list.length) {
        setError('找不到可改寫的文章，請先到「網站技術健檢／GSC」設定文章清單');
        setPhase('error');
        return;
      }
      // 預設最新一篇（清單已依 id 新到舊排序）→ 預覽原文
      await openPreview(list[0]);
    } catch (e) {
      setError(`讀取文章失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── 抓某篇原文預覽（標題＋圖＋摘要），切到預覽畫面 ──────────────
  async function openPreview(article: Article) {
    setSelected(article);
    setPreview(null);
    setPreviewLoading(true);
    setPhase('preview');
    try {
      const res = await fetch('/api/liff-blogrewrite/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPreview({
        title: data.title || article.title,
        imageUrl: data.imageUrl || '',
        summary: data.summary || '',
      });
    } catch {
      // 預覽失敗不致命：至少讓小編用清單標題直接改寫
      setPreview({ title: article.title, imageUrl: '', summary: '（原文預覽載入失敗，仍可直接開始改寫）' });
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── 開始改寫選定的那篇 → AI 依品牌人設改寫 ─────────────────────
  async function runRewrite() {
    if (!selected) return;
    setError('');
    setProgress(0);
    runStartRef.current = Date.now();
    setPhase('rewriting');

    try {
      const res = await fetch('/api/liff-blogrewrite/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, article_url: selected.url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`改寫失敗：${data.error || `HTTP ${res.status}`}`);
        setPhase('error');
        return;
      }
      setContent(data.content || '');
      setImageUrl(data.imageUrl || '');
      setSourceTitle(data.sourceTitle || selected.title || '');
      setCustomerName(data.customerName || customerName);
      setProgress(100);
      setPhase('ready');
    } catch (e) {
      setError(`改寫連線失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── AI 改文案：依指示改寫現有內文 ──
  async function rewriteText(instruction: string) {
    const instr = instruction.trim();
    if (!instr) return;
    setError('');
    setRewriteLoading(true);
    try {
      const res = await fetch('/api/liff-blogrewrite/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, instruction: instr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setContent(data.content || content);
      setTextAdjust('');
    } catch (e) {
      setError(`改文案失敗：${msg(e)}`);
    } finally {
      setRewriteLoading(false);
    }
  }

  // ── 確認送出 → 直接發佈 ──────────────────────────────────────
  async function confirm() {
    if (!content.trim()) {
      setError('內文要有才能送出');
      return;
    }
    // 組成 "ig,fb,threads" 這種字串傳給 n8n；至少要選一個平台
    const picked = (['ig', 'fb', 'threads'] as const).filter((p) => platforms[p]).join(',');
    if (!picked) {
      setError('至少要選一個要發佈的平台');
      return;
    }
    setError('');
    setConfirmLoading(true);
    try {
      const res = await fetch('/api/liff-blogrewrite/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, content, imageUrl, platforms: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPhase('done');
    } catch (e) {
      setError(`送出失敗：${msg(e)}`);
    } finally {
      setConfirmLoading(false);
    }
  }

  function closeLiff() {
    try {
      liffRef.current?.closeWindow();
    } catch {
      /* 一般瀏覽器沒有 closeWindow，忽略 */
    }
  }

  // ── 完成畫面 ──────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <Shell center>
        <div className="done">
          <div className="done-badge">✓</div>
          <h1 className="done-title">已發佈 🎉</h1>
          <p className="done-sub">
            貼文已<b>直接發到你的社群</b>，可以去 IG／FB／Threads 看看囉。
          </p>
          <button className="confirm" onClick={closeLiff}>
            關閉
          </button>
        </div>
      </Shell>
    );
  }

  // ── 讀取中／改寫中畫面（進度條）────────────────────────────────
  if (phase === 'init' || phase === 'rewriting') {
    return (
      <Shell center>
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">📝</div>
            <div className="eyebrow eyebrow-muted">
              {phase === 'init' ? 'Loading' : 'Rewriting'}
            </div>
            <h2 className="loading-h">
              {phase === 'init'
                ? '讀取你的文章中…'
                : customerName
                  ? `正在幫 ${customerName} 改寫文章`
                  : '正在改寫你的文章'}
            </h2>

            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="prog-meta">
              <span className="st">
                {phase === 'init' ? '讀取文章清單中' : 'AI 依品牌人設改寫中'}
                <span className="dots"><i>.</i><i>.</i><i>.</i></span>
              </span>
              <span className="pc">{Math.round(progress)}%</span>
            </div>
          </div>
        </section>
      </Shell>
    );
  }

  // ── 選文章清單畫面（換一篇）──────────────────────────────────
  if (phase === 'picklist') {
    return (
      <Shell>
        <header className="head">
          <div className="mark">📝</div>
          <div className="eyebrow">Blog Rewrite Studio</div>
          <h1 className="title">選一篇文章</h1>
          <p className="sub">挑一篇要改寫的部落格文章（最新在上）</p>
        </header>

        {error && <div className="err">{error}</div>}

        <section className="card">
          <div className="card-pad">
            <div className="art-list">
              {articles.map((a) => (
                <button
                  key={a.id}
                  className={`art-item${selected?.url === a.url ? ' on' : ''}`}
                  onClick={() => openPreview(a)}
                >
                  <span className="art-title">{a.title}</span>
                  <span className="art-go">›</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </Shell>
    );
  }

  // ── 預覽原文畫面（確認後才改寫）──────────────────────────────
  if (phase === 'preview') {
    return (
      <Shell>
        <header className="head">
          <div className="mark">📝</div>
          <div className="eyebrow">Blog Rewrite Studio</div>
          <h1 className="title">部落格文章改寫</h1>
          <p className="sub">先確認要改寫的原文，沒問題再開始</p>
          {customerName && (
            <div className="tab">
              <span className="dot" />
              <span className="zh">{customerName}</span>
              <span className="en">Blog</span>
            </div>
          )}
        </header>

        {error && <div className="err">{error}</div>}

        <section className="card">
          <div className="card-pad">
            <div className="card-eyebrow">
              <span className="lbl">Source · 原文預覽</span>
              {articles.length > 1 && (
                <button className="relink" onClick={() => setPhase('picklist')}>
                  ⇄ 換一篇
                </button>
              )}
            </div>

            {previewLoading ? (
              <div className="pv-loading-inline">
                <span className="spin" />
                讀取原文中…
              </div>
            ) : (
              <>
                <h2 className="src-title">{preview?.title || selected?.title}</h2>
                {preview?.imageUrl && (
                  <div className="imgwrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="genimg" src={preview.imageUrl} alt="原文配圖" />
                  </div>
                )}
                {preview?.summary && <p className="src-summary">{preview.summary}</p>}
              </>
            )}
          </div>
        </section>

        <button className="confirm" onClick={runRewrite} disabled={previewLoading}>
          開始改寫這篇
        </button>
      </Shell>
    );
  }

  // ── 結果畫面（ready / error）──────────────────────────────
  return (
    <Shell>
      <header className="head">
        <div className="mark">📝</div>
        <div className="eyebrow">Blog Rewrite Studio</div>
        <h1 className="title">部落格文章改寫</h1>
        <p className="sub">把文章改寫成一則社群貼文</p>
        {customerName && (
          <div className="tab">
            <span className="dot" />
            <span className="zh">{customerName}</span>
            <span className="en">Blog</span>
          </div>
        )}
      </header>

      {error && <div className="err">{error}</div>}

      {/* 錯誤時給重試：還沒選到文章就重讀清單，選過了就重改同一篇 */}
      {phase === 'error' && (
        <button
          className="confirm"
          style={{ marginBottom: 16 }}
          onClick={() => (selected ? runRewrite() : uid && loadArticles(uid))}
        >
          ↻ 重新載入
        </button>
      )}

      {phase === 'ready' && (
        <>
          {/* 貼文預覽：先文、接著圖（文字可直接點改）*/}
          <section className="card">
            <div className="card-pad">
              <div className="card-eyebrow">
                <span className="lbl">Preview · 貼文預覽</span>
                <button className="relink" onClick={runRewrite}>
                  ↻ 重新改寫
                </button>
              </div>

              {sourceTitle && <p className="source-hint">原文：{sourceTitle}</p>}

              <div className="pv-text">
                <textarea
                  ref={contentRef}
                  className="pv-body-input"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="貼文內容"
                  rows={1}
                  disabled={rewriteLoading}
                />
                {rewriteLoading && (
                  <div className="pv-text-loading">
                    <span className="spin" />
                    AI 改寫中…
                  </div>
                )}
              </div>

              {imageUrl && (
                <div className="imgwrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="genimg" src={imageUrl} alt="原文配圖" />
                </div>
              )}
            </div>
          </section>

          {/* 底部輸入框：叫 AI 改文（無改圖，圖沿用原文）*/}
          <section className="card">
            <div className="card-pad">
              <div className="ctl-row">
                <div className="ctl-label">
                  <span className="ic">✏️</span>
                  <span className="zh">改文字</span>
                  <span className="en">Edit Text</span>
                </div>
                <div className="field">
                  <input
                    value={textAdjust}
                    onChange={(e) => setTextAdjust(e.target.value)}
                    placeholder="例：口氣更親切、加點 emoji、縮短一半"
                    disabled={rewriteLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && textAdjust.trim() && !rewriteLoading) rewriteText(textAdjust);
                    }}
                  />
                  <button
                    className="send"
                    onClick={() => rewriteText(textAdjust)}
                    disabled={!textAdjust.trim() || rewriteLoading}
                  >
                    {rewriteLoading ? '改…' : '送出'}
                  </button>
                </div>
                {imageUrl && <p className="hint">{'// 配圖沿用原文章圖片，不重新生成'}</p>}
              </div>
            </div>
          </section>

          {/* 發佈平台選擇（發文前自己勾要發到哪些） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 2px 12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#5C6A85' }}>發佈到</span>
            {(
              [
                ['ig', 'IG'],
                ['fb', 'FB'],
                ['threads', 'Threads'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPlatforms((p) => ({ ...p, [k]: !p[k] }))}
                style={{
                  padding: '7px 16px',
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: `1px solid ${platforms[k] ? 'transparent' : 'rgba(43,92,230,.24)'}`,
                  background: platforms[k] ? 'linear-gradient(135deg,#2B5CE6,#1E48C8)' : '#F2F5FC',
                  color: platforms[k] ? '#fff' : '#5C6A85',
                }}
              >
                {platforms[k] ? '✓ ' : ''}
                {label}
              </button>
            ))}
          </div>

          {/* 確認送出 → 直接發佈 */}
          <button className="confirm" onClick={confirm} disabled={confirmLoading || rewriteLoading}>
            {confirmLoading ? '發佈中…' : '確認並發佈'}
          </button>
        </>
      )}
    </Shell>
  );
}

// 文字流背景：深淺不一的文字行，長短錯落往上飄。固定一組值，避免 SSR/CSR hydration 不一致。
const BLOG_LINES: React.CSSProperties[] = [
  { top: '14%', left: '10%', width: 130, background: 'rgba(43,92,230,.12)', animationDelay: '0s' },
  { top: '24%', left: '24%', width: 70, background: 'rgba(92,106,133,.13)', animationDelay: '-3.5s' },
  { top: '40%', left: '12%', width: 100, background: 'rgba(43,92,230,.10)', animationDelay: '-6s' },
  { top: '58%', left: '26%', width: 150, background: 'rgba(92,106,133,.12)', animationDelay: '-1.8s' },
  { top: '72%', left: '14%', width: 90, background: 'rgba(43,92,230,.11)', animationDelay: '-4.6s' },
  { top: '86%', left: '22%', width: 120, background: 'rgba(92,106,133,.10)', animationDelay: '-8s' },
];

// ── 外殼：品牌色背景＋文字流特效層＋置中容器；樣式 scoped 在 .fp（與節慶頁共用同套設計語言）──
function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true">
        {/* 文字流：一行行文字往上飄過（呼應「改寫／生成文章」），中央一條伸縮線代表 AI 正在生成 */}
        {BLOG_LINES.map((s, i) => (
          <span key={i} className="ln" style={s} />
        ))}
        <span className="writing" />
        <div className="sheen" />
      </div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

// ── 樣式（scoped 在 .fp；對齊 STACK AI 品牌色，與節慶頁 FP_CSS 一致）──
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
  --glow: rgba(43,92,230,.38);
  --field: #F2F5FC;
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

/* fixed：鎖住視窗，文字流捲動時維持定位（沿用海巡做法）*/
.fp .fx { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
/* 文字行：長短不一的圓角條，往上飄並淡入淡出，像文章一行行流過 */
.fp .fx .ln { position: absolute; height: 6px; border-radius: 3px; animation: fp-rise 10s linear infinite; }
/* 生成中的一行：寬度來回伸縮，像 AI 正在打字生成文字 */
.fp .fx .writing { position: absolute; top: 49%; left: 16%; height: 7px; width: 150px; border-radius: 3px;
  background: linear-gradient(90deg, var(--blue), rgba(43,92,230,.1)); transform-origin: left center;
  opacity: .5; animation: fp-write 2.6s ease-in-out infinite; }
.fp .fx .sheen {
  position: absolute; top: -30%; left: -60%; width: 55%; height: 160%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.6), transparent);
  transform: skewX(-14deg); animation: fp-sheen 10s ease-in-out infinite;
}

.fp .wrap { position: relative; z-index: 1; width: 100%; max-width: 420px; margin: 0 auto; padding: 0 16px; }
.fp .wrap-center { min-height: 82vh; display: flex; flex-direction: column; justify-content: center; }

.fp .head { text-align: center; margin: 6px 0 20px; }
.fp .mark {
  position: relative; width: 56px; height: 56px; margin: 0 auto 13px; border-radius: 16px;
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
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  padding: 6px 14px; margin-top: 12px;
}
.fp .tab .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--green); box-shadow: 0 0 8px 1px rgba(35,174,110,.55); animation: fp-blink 2s ease-in-out infinite; }
.fp .tab .zh { font-size: 11px; font-weight: 800; color: var(--ink); letter-spacing: .02em; }
.fp .tab .en { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--blue); }

.fp .card {
  position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 18px; margin-bottom: 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,.85) inset, 0 22px 44px -28px rgba(30,60,120,.45);
}
.fp .card-pad { padding: 16px 16px 18px; }
.fp .card-eyebrow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
.fp .card-eyebrow .lbl { font-family: var(--mono); font-size: 9.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); }
.fp .relink { border: 0; background: transparent; cursor: pointer; font-family: var(--mono); font-size: 10.5px; font-weight: 600; letter-spacing: .05em; color: var(--blue); display: inline-flex; align-items: center; gap: 4px; }

.fp .source-hint { font-family: var(--mono); font-size: 10px; color: var(--ink-3); margin: 0 0 10px; letter-spacing: .02em; }

/* 原文預覽（preview 階段）*/
.fp .src-title { font-size: 16px; font-weight: 900; line-height: 1.5; color: var(--ink); margin: 0 0 12px; }
.fp .src-summary { font-size: 12.5px; line-height: 1.85; color: var(--ink-2); margin: 12px 0 0; white-space: pre-wrap; }
.fp .pv-loading-inline { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 26px 0;
  font-family: var(--mono); font-size: 11.5px; font-weight: 700; color: var(--blue-deep); letter-spacing: .04em; }
.fp .pv-loading-inline .spin {
  width: 14px; height: 14px; border-radius: 999px; border: 2px solid var(--line-2); border-top-color: var(--blue);
  animation: fp-spin .8s linear infinite;
}

/* 文章清單（picklist 階段）*/
.fp .art-list { display: flex; flex-direction: column; gap: 8px; }
.fp .art-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left;
  border: 1px solid var(--line); background: var(--field); border-radius: 12px; padding: 13px 14px; cursor: pointer;
  transition: border-color .15s, background .15s;
}
.fp .art-item:active { transform: scale(.99); }
.fp .art-item.on { border-color: rgba(43,92,230,.5); background: var(--blue-soft); }
.fp .art-title { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; line-height: 1.5; color: var(--ink); }
.fp .art-go { flex-shrink: 0; font-size: 18px; font-weight: 700; color: var(--blue); }

.fp .pv-text { position: relative; }
.fp .pv-title-input {
  width: 100%; border: 0; background: transparent; outline: none; font-family: var(--sans);
  font-size: 17.5px; font-weight: 900; line-height: 1.42; color: var(--ink);
  margin: 0 0 8px; padding: 3px 5px; border-radius: 8px;
}
.fp .pv-title-input:focus { background: var(--blue-soft); }
.fp .pv-body-input {
  display: block; width: 100%; border: 0; background: transparent; outline: none;
  resize: none; overflow: hidden; font-family: var(--sans);
  font-size: 13.5px; line-height: 1.9; color: #46506A;
  margin: 0 0 14px; padding: 3px 5px; border-radius: 8px;
}
.fp .pv-body-input:focus { background: var(--blue-soft); }
.fp .pv-text-loading {
  position: absolute; inset: -6px; z-index: 5; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: rgba(255,255,255,.9); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); border-radius: 12px;
  font-family: var(--mono); font-size: 11.5px; font-weight: 700; color: var(--blue-deep); letter-spacing: .04em;
}
.fp .pv-text-loading .spin {
  width: 14px; height: 14px; border-radius: 999px; border: 2px solid var(--line-2); border-top-color: var(--blue);
  animation: fp-spin .8s linear infinite;
}

.fp .imgwrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
.fp .genimg { display: block; width: 100%; }

.fp .ctl-label {
  display: inline-flex; align-items: center; gap: 7px; clip-path: var(--chamfer);
  background: var(--blue-soft); padding: 5px 12px; margin: 0 0 9px;
}
.fp .ctl-label .ic { font-size: 12px; }
.fp .ctl-label .zh { font-size: 11px; font-weight: 800; color: var(--ink); }
.fp .ctl-label .en { font-family: var(--mono); font-size: 9px; font-weight: 600; letter-spacing: .1em; color: var(--blue); }
.fp .field {
  display: flex; align-items: center; gap: 8px; background: var(--field);
  border: 1px solid var(--line); border-radius: 12px; padding: 6px 6px 6px 13px;
  transition: border-color .2s, box-shadow .2s;
}
.fp .field:focus-within { border-color: rgba(43,92,230,.6); box-shadow: 0 0 0 3px rgba(43,92,230,.14); }
.fp .field input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-family: var(--sans); font-size: 13px; color: var(--ink); }
.fp .field input::placeholder { color: var(--ink-3); }
.fp .field input:disabled { opacity: .5; }
.fp .send {
  flex-shrink: 0; border: 0; cursor: pointer; color: #FFFFFF; font-family: var(--mono);
  font-size: 12px; font-weight: 700; letter-spacing: .04em; padding: 8px 15px; border-radius: 9px;
  background: linear-gradient(135deg, var(--blue), var(--blue-deep));
  box-shadow: 0 5px 14px -5px var(--glow); transition: transform .1s;
}
.fp .send:active { transform: scale(.96); }
.fp .send:disabled { opacity: .4; cursor: default; box-shadow: none; }
.fp .send:disabled:active { transform: none; }
.fp .hint { font-family: var(--mono); font-size: 9.5px; color: var(--ink-3); margin: 8px 2px 0; letter-spacing: .03em; }

.fp .confirm {
  position: relative; width: 100%; border: 0; cursor: pointer; color: #FFFFFF;
  font-family: var(--sans); font-size: 15px; font-weight: 800; letter-spacing: .04em;
  padding: 15px; border-radius: 14px; margin-top: 2px;
  background: linear-gradient(135deg, var(--blue), var(--blue-deep));
  box-shadow: 0 14px 28px -12px var(--glow), inset 0 1px 0 rgba(255,255,255,.3);
  transition: transform .1s;
}
.fp .confirm:active { transform: scale(.98); }
.fp .confirm:disabled { opacity: .4; cursor: default; }
.fp .confirm:disabled:active { transform: none; }

.fp .err {
  margin-bottom: 14px; border-radius: 12px; background: #FEF2F2; border: 1px solid #FBD5D5;
  padding: 12px 14px; font-size: 13px; color: #B42318; line-height: 1.6;
}

.fp .loading-card { text-align: center; }
.fp .loading-h { font-size: 16px; font-weight: 900; color: var(--ink); margin: 5px 0 20px; letter-spacing: .02em; }
.fp .prog-track { height: 7px; border-radius: 999px; background: #DDE6F6; overflow: hidden; margin: 2px 0 0; border: 1px solid var(--line); }
.fp .prog-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--blue-deep), #5B87F2); box-shadow: 0 0 12px 0 var(--glow); transition: width .5s ease-out; }
.fp .prog-meta { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-top: 10px; }
.fp .prog-meta .st { flex: 1; text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: .05em; color: var(--ink-2); line-height: 1.5; }
.fp .prog-meta .st .dots { display: inline; letter-spacing: 2px; }
.fp .prog-meta .st .dots i { font-style: normal; opacity: .2; animation: fp-dots 1.4s infinite; }
.fp .prog-meta .st .dots i:nth-child(2) { animation-delay: .2s; }
.fp .prog-meta .st .dots i:nth-child(3) { animation-delay: .4s; }
.fp .prog-meta .pc { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--blue); }

.fp .done { text-align: center; }
.fp .done-badge {
  width: 64px; height: 64px; margin: 0 auto 18px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-size: 30px; color: #fff;
  background: linear-gradient(135deg, var(--green), #1B9760);
  box-shadow: 0 14px 30px -10px rgba(35,174,110,.6);
}
.fp .done-title { font-size: 20px; font-weight: 900; color: var(--ink); margin: 0 0 10px; }
.fp .done-sub { font-size: 13px; color: var(--ink-2); line-height: 1.8; margin: 0 0 26px; }
.fp .done-sub b { color: var(--blue-deep); font-weight: 800; }

@keyframes fp-sheen { 0% { transform: translateX(0) skewX(-14deg); } 55%, 100% { transform: translateX(360%) skewX(-14deg); } }
@keyframes fp-blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes fp-spin { to { transform: rotate(360deg); } }
@keyframes fp-dots { 0%, 60%, 100% { opacity: .2; } 30% { opacity: 1; } }
@keyframes fp-rise { 0% { transform: translateY(40px); opacity: 0; } 15%, 85% { opacity: 1; } 100% { transform: translateY(-70px); opacity: 0; } }
@keyframes fp-write { 0%, 100% { transform: scaleX(.2); opacity: .3; } 50% { transform: scaleX(1); opacity: .6; } }
@media (prefers-reduced-motion: reduce) {
  /* 沿用海巡經驗：不關文字流（多數手機預設開減少動態，關了就看不到）；只收會掃過字的 sheen */
  .fp .tab .dot, .fp .pv-text-loading .spin,
  .fp .prog-meta .st .dots i, .fp .fx .sheen { animation: none; }
  .fp .fx .sheen { display: none; }
}
`;
