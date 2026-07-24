'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 短影音轉貼文 LIFF：選影片上傳 → 這頁抽音軌＋轉逐字稿 → n8n AI 依品牌人設寫貼文 → 生配圖。
// 跟節慶頁同一套視覺／進度條／改文字改圖模式，差別只在多一個「選檔上傳」起手式。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_VIDEOPOST || '';

type Phase = 'init' | 'upload' | 'transcribing' | 'image' | 'ready' | 'done' | 'error';

// 進度條：轉逐字稿+AI寫文案抓 ~50 秒為基準；生圖沿用節慶頁的 ~185 秒基準（gpt-5.4-image-2 較慢）。
const PROGRESS_CAP = 95;
const TRANSCRIBE_TAU_MS = 50_000;
const IMAGE_TAU_MS = 185_000;
const PHASE_LABEL: Record<string, string> = {
  transcribing: '影片轉逐字稿＋AI 寫文案中…',
  image: 'AI 生成配圖中…',
};

export default function VideoPostLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [progress, setProgress] = useState(0);
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [adjustment, setAdjustment] = useState(''); // 定向改圖的需求文字
  const [textAdjust, setTextAdjust] = useState(''); // 定向改文案的需求文字
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  // 這次要發到哪些平台（預設全開，送出時只送還亮著的）
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

  // ── 內文框自動撐高 ──
  // 依賴要含 phase：content 在文案階段就設好，但 textarea 要到結果畫面(phase ready)才 render；
  // 若只依賴 content，撐高會在 textarea 還沒 mount 時就跑掉、之後不再觸發 → 框卡在一行高、文字被截。
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content, phase]);

  // ── 進度條：依「經過時間」漸近爬向 95%（單調遞增，不倒退）──
  useEffect(() => {
    if (phase !== 'transcribing' && phase !== 'image') return;
    const tau = phase === 'transcribing' ? TRANSCRIBE_TAU_MS : IMAGE_TAU_MS;
    const id = setInterval(() => {
      const start = runStartRef.current || Date.now();
      const elapsed = Date.now() - start;
      const target = PROGRESS_CAP * (1 - Math.exp(-elapsed / tau));
      setProgress((p) => (target > p ? target : p));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  // ── 啟動：liff init → 取 uid → 停在選檔畫面 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';
        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID_VIDEOPOST 環境變數');
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
        setPhase('upload');
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

  // ── 上傳影片 → 轉逐字稿 → AI 生文案 → 生圖 ──
  async function runAll() {
    if (!file) {
      setError('請先選擇影片檔案');
      return;
    }
    setError('');
    setImageUrl('');
    setProgress(0);
    runStartRef.current = Date.now();
    setPhase('transcribing');

    try {
      const form = new FormData();
      form.append('line_uid', uid);
      form.append('file', file);
      const startRes = await fetch('/api/liff-videopost/generate', { method: 'POST', body: form });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || `HTTP ${startRes.status}`);
      }
      const jobId = startData.jobId as string;

      const deadline = Date.now() + 6 * 60 * 1000;
      let tData: { content?: string; imagePrompt?: string; customerName?: string } | null = null;
      while (!tData) {
        await new Promise((r) => setTimeout(r, 3500));
        const pr = await fetch(`/api/liff-videopost/generate?jobId=${encodeURIComponent(jobId)}`);
        let pd: { status?: string; content?: string; imagePrompt?: string; customerName?: string; error?: string };
        try {
          pd = await pr.json();
        } catch {
          if (Date.now() > deadline) throw new Error('生文案等待逾時，請重試');
          continue;
        }
        if (pd.status === 'done') {
          tData = pd;
          break;
        }
        if (pd.status === 'error') throw new Error(pd.error || '生文案失敗');
        if (Date.now() > deadline) throw new Error('生文案等待逾時，請重試');
      }

      setContent(tData.content || '');
      setImagePrompt(tData.imagePrompt || '');
      setCustomerName(tData.customerName || '');

      await genImage(tData.imagePrompt || '', '', false, uid);
    } catch (e) {
      setError(`生文案失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── 生圖（adjustment=定向改圖需求；restart=true 單獨重生、重置計時；notifyLineUid=首次生成完成才推播 LINE 通知）──
  async function genImage(prompt: string, adj = '', restart = true, notifyLineUid?: string) {
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
      const startRes = await fetch('/api/liff-videopost/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 有定向調整且手上有當前圖 → 帶上一張圖走 img2img（只改調整處、其餘不動）；首次/重新生成不帶
        body: JSON.stringify({
          imagePrompt: prompt,
          adjustment: adj,
          baseImage: adj && imageUrl ? imageUrl : undefined,
          notifyLineUid,
        }),
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok || !startData.jobId) {
        throw new Error(startData.error || `HTTP ${startRes.status}`);
      }
      const jobId = startData.jobId as string;

      const deadline = Date.now() + 6 * 60 * 1000;
      while (true) {
        await new Promise((r) => setTimeout(r, 3500));
        const pr = await fetch(`/api/liff-videopost/image?jobId=${encodeURIComponent(jobId)}`);
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

  // ── AI 改文案 ──
  async function rewriteText(instruction: string) {
    const instr = instruction.trim();
    if (!instr) return;
    setError('');
    setRewriteLoading(true);
    try {
      const res = await fetch('/api/liff-videopost/rewrite', {
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

  // ── 確認送出 ──
  async function confirm() {
    if (!content.trim() || !imageUrl) {
      setError('內文、圖片都要有才能送出');
      return;
    }
    // 至少要勾一個平台，不然送出去等於什麼都不發
    const picked = (['ig', 'fb', 'threads'] as const).filter((p) => platforms[p]).join(',');
    if (!picked) {
      setError('至少要選一個發佈平台');
      return;
    }
    setError('');
    setConfirmLoading(true);
    try {
      const res = await fetch('/api/liff-videopost/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, content, imageDataUrl: imageUrl, platforms: picked }),
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

  // ── 完成畫面 ──
  if (phase === 'done') {
    return (
      <Shell center>
        <div className="done">
          <div className="done-badge">✓</div>
          <h1 className="done-title">已發佈</h1>
          <p className="done-sub">
            貼文已經送到你選的社群平台，稍等一下就會出現。
          </p>
          <button className="confirm" onClick={closeLiff}>
            回到 LINE
          </button>
        </div>
      </Shell>
    );
  }

  // ── 選檔上傳畫面 ──
  if (phase === 'upload') {
    return (
      <Shell center>
        <header className="head">
          <div className="mark">🎬</div>
          <div className="eyebrow">Video Post Studio</div>
          <h1 className="title">短影音轉貼文</h1>
          <p className="sub">上傳影片，AI 自動聽打逐字稿寫成貼文</p>
        </header>

        {error && <div className="err">{error}</div>}

        <section className="card">
          <div className="card-pad">
            <label className="filepick">
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <span className="fp-ic">📎</span>
              <span className="fp-txt">{file ? file.name : '點此選擇影片檔案'}</span>
            </label>
            <p className="hint">{'// 影片長度建議在 3 分鐘內，檔案上限 200MB'}</p>
          </div>
        </section>

        <button className="confirm" onClick={runAll} disabled={!file}>
          開始生成貼文
        </button>
      </Shell>
    );
  }

  // ── 生成中畫面（進度條）──
  if (phase === 'init' || phase === 'transcribing' || phase === 'image') {
    return (
      <Shell center>
        <section className="card">
          <div className="card-pad loading-card">
            <div className="mark">🎬</div>
            <div className="eyebrow eyebrow-muted">
              {phase === 'init' ? 'Loading' : 'Rendering'}
            </div>
            <h2 className="loading-h">
              {phase === 'init' ? '讀取中…' : customerName ? `正在幫 ${customerName} 生成短影音貼文` : '正在生成你的短影音貼文'}
            </h2>

            {phase !== 'init' && (
              <>
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="prog-meta">
                  <span className="st">{PHASE_LABEL[phase]}</span>
                  <span className="pc">{Math.round(progress)}%</span>
                </div>
                <p className="waited">請耐心等，別關閉頁面</p>
              </>
            )}
          </div>
        </section>
      </Shell>
    );
  }

  // ── 結果畫面（ready / error）──
  return (
    <Shell>
      <header className="head">
        <div className="mark">🎬</div>
        <div className="eyebrow">Video Post Studio</div>
        <h1 className="title">短影音轉貼文</h1>
        <p className="sub">AI 幫你把影片內容，寫成一則貼文</p>
        {customerName && (
          <div className="tab">
            <span className="dot" />
            <span className="zh">{customerName}</span>
            <span className="en">Video</span>
          </div>
        )}
      </header>

      {error && <div className="err">{error}</div>}

      {phase === 'error' && (
        <button className="confirm" style={{ marginBottom: 16 }} onClick={runAll}>
          ↻ 重新生成
        </button>
      )}

      {phase === 'ready' && (
        <>
          <section className="card">
            <div className="card-pad">
              <div className="card-eyebrow">
                <span className="lbl">Preview · 貼文預覽</span>
                <button className="relink" onClick={runAll}>
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
                <img className="genimg" src={imageUrl} alt="短影音配圖" />
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

          <button className="confirm" onClick={confirm} disabled={confirmLoading || rewriteLoading}>
            {confirmLoading ? '發佈中…' : '確認發佈這篇 ＋ 這張圖'}
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
        {/* 等化器波形：呼應「短影音／播放」主題，底部一排音波隨機跳動（壓在毛玻璃卡後不擋字）*/}
        <div className="eq">
          {Array.from({ length: 20 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="sheen" />
      </div>
      <div className={center ? 'wrap wrap-center' : 'wrap'}>{children}</div>
    </div>
  );
}

// ── 樣式（scoped 在 .fp；對齊 STACK AI 品牌色，與節慶頁 FP_CSS 一致，多了選檔 filepick）──
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

/* fixed：鎖住視窗，波形固定在底部（沿用海巡做法）*/
.fp .fx { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
/* 等化器音波：底部一排上下跳動的長條，用 nth-child 錯開節奏做出隨機感 */
.fp .fx .eq { position: absolute; bottom: 0; left: 0; right: 0; height: 150px;
  display: flex; align-items: flex-end; justify-content: center; gap: 6px; opacity: .4; padding: 0 14px; }
.fp .fx .eq i { width: 6px; border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, var(--blue), var(--green)); animation: fp-eq 1.1s ease-in-out infinite; }
.fp .fx .eq i:nth-child(3n) { animation-duration: 1.5s; }
.fp .fx .eq i:nth-child(3n+1) { animation-duration: .9s; }
.fp .fx .eq i:nth-child(2n) { animation-delay: -.4s; }
.fp .fx .eq i:nth-child(4n) { animation-delay: -.7s; }
.fp .fx .eq i:nth-child(5n) { animation-delay: -.2s; }
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

.fp .filepick {
  display: flex; align-items: center; gap: 10px; cursor: pointer;
  border: 1px dashed var(--line-2); background: var(--field); border-radius: 12px; padding: 14px 16px;
}
.fp .filepick input { display: none; }
.fp .filepick .fp-ic { font-size: 18px; }
.fp .filepick .fp-txt { font-size: 13px; color: var(--ink-2); }

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
@keyframes fp-spin { to { transform: rotate(360deg); } }
@keyframes fp-eq { 0%, 100% { height: 14px; } 50% { height: 84px; } }
@media (prefers-reduced-motion: reduce) {
  /* 沿用海巡經驗：不關 ambient 波形（多數手機預設開減少動態，關了就看不到）；只收會掃過字的 sheen */
  .fp .tab .dot, .fp .pv-text-loading .spin, .fp .fx .sheen { animation: none; }
  .fp .fx .sheen { display: none; }
}
`;
