'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 時事互動貼文 LIFF：一開頁就自動「抓熱門話題→生文案 → 生圖」一氣呵成，過程顯示進度條。
// 文案階段比節慶久（多了 Threads 抓取＋逐篇評分），TAU 抓長一點；圖片階段跟節慶一致。
// 完全比照節慶模式：LIFF 上互動生成/改文/改圖，確認送出後 n8n 推「確認發佈/丟棄」卡回 LINE。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_NEWS || '';

type Phase = 'init' | 'pick' | 'text' | 'image' | 'ready' | 'done' | 'error';

const MAX_KEYWORDS = 3;

const PROGRESS_CAP = 95;
const PROGRESS_TAU_TEXT_MS = 90_000; // 文案：抓熱門話題+逐篇評分+AI寫貼文，較久
const PROGRESS_TAU_IMAGE_MS = 185_000; // 生圖：跟節慶一致
const PHASE_LABEL: Record<string, string> = {
  init: '連線中…',
  text: 'AI 分析熱門話題＋生成貼文中…',
  image: 'AI 生成配圖中…',
};

export default function NewsLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [progress, setProgress] = useState(0);
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');

  const [keywords, setKeywords] = useState<string[]>([]); // 客戶的產業關鍵字（可選項）
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]); // 用戶複選（最多 3）
  const [content, setContent] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [textDone, setTextDone] = useState(false);
  const [adjustment, setAdjustment] = useState(''); // 定向改圖的需求文字
  const [textAdjust, setTextAdjust] = useState(''); // 定向改文案的需求文字
  const [rewriteLoading, setRewriteLoading] = useState(false); // AI 改文案中
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');
  const liffRef = useRef<Liff | null>(null);
  const runStartRef = useRef<number>(0);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // ── 內文框自動撐高：完整顯示全文，不要內部滑動 ──
  // 依賴要含 phase：content 是在文案階段就設好，但 textarea 要到 phase='ready' 才 render，
  // 若只依賴 content，撐高會在 textarea 還沒 mount 時就跑掉、之後不再觸發 → 框卡在一行高、文字被截。
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content, phase]);

  // ── 進度條：依「經過時間」漸近爬向 95%（單調遞增，不倒退）──
  useEffect(() => {
    if (phase !== 'text' && phase !== 'image') return;
    const tau = phase === 'text' ? PROGRESS_TAU_TEXT_MS : PROGRESS_TAU_IMAGE_MS;
    const id = setInterval(() => {
      const start = runStartRef.current || Date.now();
      const elapsed = Date.now() - start;
      const target = PROGRESS_CAP * (1 - Math.exp(-elapsed / tau));
      setProgress((p) => (target > p ? target : p));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // ── 啟動：liff init → 取 uid → 自動跑完整流程 ─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_NEWS 環境變數');
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
        // 先查客戶的產業關鍵字讓用戶複選，選完才開始生成
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

  // ── 一氣呵成：抓熱門話題+生文案 → 生圖 ────────────────────────
  async function runAll(lineUid: string) {
    setError('');
    setImageUrl('');
    setTextDone(false);
    setProgress(0);
    runStartRef.current = Date.now();

    setPhase('text');
    try {
      // ① 送出生文案任務（立刻回 jobId，避開 Cloudflare 對長請求的 100 秒切斷）
      const startRes = await fetch('/api/liff-news/generate', {
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
      let imagePromptResult = '';
      while (true) {
        await new Promise((r) => setTimeout(r, 4000));
        const pr = await fetch(`/api/liff-news/generate?jobId=${encodeURIComponent(jobId)}`);
        let pd: { status?: string; content?: string; imagePrompt?: string; customerName?: string; error?: string };
        try {
          pd = await pr.json();
        } catch {
          if (Date.now() > deadline) throw new Error('生文案等待逾時，請重試');
          continue; // 暫時性非 JSON 回應 → 繼續輪詢
        }
        if (pd.status === 'done') {
          setContent(pd.content || '');
          setImagePrompt(pd.imagePrompt || '');
          setCustomerName(pd.customerName || '');
          setTextDone(true);
          imagePromptResult = pd.imagePrompt || '';
          break;
        }
        if (pd.status === 'error') throw new Error(pd.error || '生文案失敗');
        if (Date.now() > deadline) throw new Error('生文案等待逾時，請重試');
      }

      await genImage(imagePromptResult, '', false);
    } catch (e) {
      setError(`生文案失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── 生圖（adjustment=定向改圖需求；restart=true 單獨重生、重置計時）──
  async function genImage(prompt: string, adj = '', restart = true) {
    if (!prompt) {
      setError('沒有圖片提示詞，請重新生成');
      setPhase('error');
      return;
    }
    setError('');
    if (restart) {
      setProgress(0);
      runStartRef.current = Date.now();
    }
    setPhase('image');
    try {
      const startRes = await fetch('/api/liff-news/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompt: prompt, adjustment: adj }),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || `HTTP ${startRes.status}`);
      }
      const jobId = startData.jobId as string;

      const deadline = Date.now() + 6 * 60 * 1000;
      while (true) {
        await new Promise((r) => setTimeout(r, 3500));
        const pr = await fetch(`/api/liff-news/image?jobId=${encodeURIComponent(jobId)}`);
        let pd: { status?: string; dataUrl?: string; error?: string };
        try {
          pd = await pr.json();
        } catch {
          if (Date.now() > deadline) throw new Error('生圖等待逾時，請重試');
          continue;
        }
        if (pd.status === 'done' && pd.dataUrl) {
          setImageUrl(pd.dataUrl);
          setProgress(100);
          setPhase('ready');
          return;
        }
        if (pd.status === 'error') throw new Error(pd.error || '生圖失敗');
        if (Date.now() > deadline) throw new Error('生圖等待逾時，請重試');
      }
    } catch (e) {
      setError(`生圖失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── AI 改文案：依指示改寫現有標題/內文（不重生圖，只改文字）──
  async function rewriteText(instruction: string) {
    const instr = instruction.trim();
    if (!instr) return;
    setError('');
    setRewriteLoading(true);
    try {
      const res = await fetch('/api/liff-news/rewrite', {
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

  // ── 確認送出 ──────────────────────────────────────────────
  async function confirm() {
    if (!content.trim() || !imageUrl) {
      setError('內文、圖片都要有才能送出');
      return;
    }
    setError('');
    setConfirmLoading(true);
    try {
      const res = await fetch('/api/liff-news/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, content, imageDataUrl: imageUrl }),
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

  // ── 選關鍵字畫面 ──────────────────────────────────────────
  if (phase === 'pick') {
    return (
      <Shell>
        <header className="head">
          <div className="mark">🔥</div>
          <div className="eyebrow">Trending Post Studio</div>
          <h1 className="title">時事互動貼文</h1>
          <p className="sub">選 1～3 個想蹭的關鍵字，AI 幫你抓相關熱門話題</p>
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

        <button className="confirm" onClick={() => uid && runAll(uid)} disabled={selectedKeywords.length === 0}>
          開始生成貼文
        </button>
      </Shell>
    );
  }

  // ── 完成畫面 ──────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <Shell center>
        <div className="done">
          <div className="done-badge">✓</div>
          <h1 className="done-title">草稿已存好</h1>
          <p className="done-sub">
            回到 LINE 對話，按<b>「確認發佈」</b>就會發到你的社群。
          </p>
          <button className="confirm" onClick={closeLiff}>
            回到 LINE
          </button>
        </div>
      </Shell>
    );
  }

  // ── 生成中畫面（進度條）────────────────────────────────────
  if (phase === 'init' || phase === 'text' || phase === 'image') {
    return (
      <Shell center>
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">🔥</div>
            <div className="eyebrow eyebrow-muted">
              {phase === 'init' ? 'Connecting' : 'Rendering'}
            </div>
            <h2 className="loading-h">
              {customerName ? `正在幫 ${customerName} 準備時事貼文` : '正在準備你的時事貼文'}
            </h2>

            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="prog-meta">
              <span className="st">{PHASE_LABEL[phase]}</span>
              <span className="pc">{Math.round(progress)}%</span>
            </div>

            <div className="steps">
              <Step label="TEXT" done={textDone} now={phase === 'text'} />
              <div className="step-line" />
              <Step label="IMAGE" done={progress >= 100} now={phase === 'image'} />
            </div>

            {phase === 'text' && <p className="waited">正在抓熱門話題，請耐心等</p>}
            {phase === 'image' && <p className="waited">請耐心等，別關閉頁面</p>}
          </div>
        </section>
      </Shell>
    );
  }

  // ── 結果畫面（ready / error）──────────────────────────────
  return (
    <Shell>
      <header className="head">
        <div className="mark">🔥</div>
        <div className="eyebrow">Trending Post Studio</div>
        <h1 className="title">時事互動貼文</h1>
        <p className="sub">把最近的熱門話題寫成一則貼文</p>
        {customerName && (
          <div className="tab">
            <span className="dot" />
            <span className="zh">{customerName}</span>
            <span className="en">Trending</span>
          </div>
        )}
      </header>

      {error && <div className="err">{error}</div>}

      {phase === 'error' && (
        <button className="confirm" style={{ marginBottom: 16 }} onClick={() => uid && runAll(uid)}>
          ↻ 重新生成
        </button>
      )}

      {phase === 'ready' && (
        <>
          <section className="card">
            <div className="card-pad">
              <div className="card-eyebrow">
                <span className="lbl">Preview · 貼文預覽</span>
                <button className="relink" onClick={() => uid && runAll(uid)}>
                  ↻ 整篇重生
                </button>
              </div>

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

              <div className="imgwrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="genimg" src={imageUrl} alt="時事配圖" />
              </div>
            </div>
          </section>

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
              </div>

              <div className="divider-soft" />

              <div className="ctl-row">
                <div className="ctl-label">
                  <span className="ic">🎨</span>
                  <span className="zh">改圖</span>
                  <span className="en">Edit Image</span>
                </div>
                <div className="field">
                  <input
                    value={adjustment}
                    onChange={(e) => setAdjustment(e.target.value)}
                    placeholder="例：換成海邊、改俯拍、只要桌面不要人"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && adjustment.trim()) genImage(imagePrompt, adjustment.trim(), true);
                    }}
                  />
                  <button
                    className="send"
                    onClick={() => adjustment.trim() && genImage(imagePrompt, adjustment.trim(), true)}
                    disabled={!adjustment.trim()}
                  >
                    套用
                  </button>
                </div>
                <p className="hint">{'// 改圖以原圖情境為基準重新生成'}</p>
              </div>
            </div>
          </section>

          <button className="confirm" onClick={confirm} disabled={confirmLoading || rewriteLoading}>
            {confirmLoading ? '存檔中…' : '確認使用這篇 ＋ 這張圖'}
          </button>
        </>
      )}
    </Shell>
  );
}

// ── 外殼：品牌色背景＋電路特效層＋置中容器；樣式 scoped 在 .fp（與節慶頁共用同套設計語言）──
function Shell({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="fp">
      <style>{FP_CSS}</style>
      <div className="fx" aria-hidden="true">
        <div className="grid" />
        <svg viewBox="0 0 400 900" preserveAspectRatio="xMidYMid slice" fill="none">
          <g stroke="rgba(43,92,230,.16)" strokeWidth="1">
            <path d="M20 120 H120 L150 90 H240" />
            <path d="M380 60 V160 L340 200 H300" />
            <path d="M40 520 H100 L130 550 V640" />
            <path d="M360 700 H280 L250 730 V820" />
          </g>
          <g fill="rgba(43,92,230,.5)">
            <circle cx="120" cy="120" r="3" />
            <circle cx="240" cy="90" r="3" />
            <circle cx="300" cy="200" r="3" />
            <circle cx="100" cy="520" r="3" />
            <circle cx="280" cy="700" r="3" />
          </g>
          <g fill="rgba(35,174,110,.45)">
            <circle cx="150" cy="90" r="3" />
            <circle cx="130" cy="640" r="3" />
          </g>
        </svg>
        <div className="cube" style={{ width: 14, height: 14, top: 200, right: 26 }} />
        <div className="cube" style={{ width: 10, height: 10, top: 470, left: 30, opacity: 0.7 }} />
        <div className="cube" style={{ width: 12, height: 12, bottom: 150, right: 36, opacity: 0.8 }} />
        <div className="sheen" />
      </div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

// 兩步驟指示珠子
function Step({ label, done, now }: { label: string; done: boolean; now: boolean }) {
  return (
    <div className={`step ${done ? 'done' : now ? 'now' : ''}`}>
      <div className="bead">{done ? '✓' : now ? '◍' : '•'}</div>
      <span className="cap">{label}</span>
    </div>
  );
}

// ── 樣式（scoped 在 .fp；對齊 STACK AI 品牌色，與節慶/部落格改寫頁 FP_CSS 一致）──
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

.fp .fx { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.fp .fx .grid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(43,92,230,.12) 1px, transparent 1px);
  background-size: 24px 24px;
  -webkit-mask-image: radial-gradient(circle at 50% 22%, #000 0%, transparent 80%);
          mask-image: radial-gradient(circle at 50% 22%, #000 0%, transparent 80%);
}
.fp .fx svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.fp .fx .sheen {
  position: absolute; top: -30%; left: -60%; width: 55%; height: 160%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.6), transparent);
  transform: skewX(-14deg); animation: fp-sheen 10s ease-in-out infinite;
}
.fp .cube { position: absolute; border-radius: 4px; transform: rotate(45deg);
  background: linear-gradient(135deg, rgba(43,92,230,.28), rgba(43,92,230,.10)); }

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
.fp .divider-soft { height: 1px; background: var(--line); margin: 16px 0; }

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
.fp .prog-meta .pc { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--blue); }
.fp .steps { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 22px; }
.fp .step { display: flex; flex-direction: column; align-items: center; gap: 8px; font-family: var(--mono); font-size: 10px; letter-spacing: .06em; }
.fp .step .bead { width: 27px; height: 27px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; border: 1px solid var(--line); color: var(--ink-3); background: var(--field); }
.fp .step .cap { color: var(--ink-3); }
.fp .step.done .bead { background: linear-gradient(135deg, var(--green), #1B9760); color: #fff; border-color: transparent; box-shadow: 0 4px 12px -3px rgba(35,174,110,.5); }
.fp .step.done .cap { color: var(--green); }
.fp .step.now .bead { border-color: rgba(43,92,230,.6); color: var(--blue); animation: fp-pulse 1.6s ease-in-out infinite; }
.fp .step.now .cap { color: var(--blue); }
.fp .step-line { width: 30px; height: 1.5px; background: var(--line); border-radius: 2px; }
.fp .waited { font-family: var(--mono); font-size: 10.5px; color: var(--ink-2); margin-top: 18px; letter-spacing: .05em; text-align: center; }

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
@keyframes fp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(43,92,230,.4); } 50% { box-shadow: 0 0 0 6px rgba(43,92,230,0); } }
@keyframes fp-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .fp .fx .sheen, .fp .tab .dot, .fp .step.now .bead, .fp .pv-text-loading .spin { animation: none; }
  .fp .fx .sheen { display: none; }
}
`;
