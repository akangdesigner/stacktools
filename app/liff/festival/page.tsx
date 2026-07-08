'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 節慶生圖 LIFF：一開頁就自動「生文案 → 生圖」一氣呵成，過程顯示進度條。
// 進度條「階段」是真的（文案完成→跳 42%、圖片真的回來→跳 100%），
// 階段內因為 API 是黑箱（不回報 %）改用時間平滑推進。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';

type Phase = 'init' | 'text' | 'image' | 'ready' | 'done' | 'error';

// 進度條：以「平均約 9 分鐘」為基準的漸近曲線，慢慢爬向上限 95%（最後 90→95 當緩衝、
// 沒好就卡在 95），圖文真的回來時直接跳 100%。TAU 調成 ~9 分鐘時約落在 90%。
const PROGRESS_CAP = 95;
const PROGRESS_TAU_MS = 185_000;
const PHASE_LABEL: Record<string, string> = {
  init: '連線中…',
  text: 'AI 生成貼文文案中…',
  image: 'AI 生成配圖中…（請耐心等，別關閉頁面）',
};

export default function FestivalLiffPage() {
  const [phase, setPhase] = useState<Phase>('init');
  const [progress, setProgress] = useState(0);
  const [uid, setUid] = useState('');
  const [customerName, setCustomerName] = useState('');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [textDone, setTextDone] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');
  const liffRef = useRef<Liff | null>(null);
  const runStartRef = useRef<number>(0); // 本輪生成開始時間（毫秒）

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // ── 進度條：依「經過時間」漸近爬向 95%（單調遞增，不倒退）──
  useEffect(() => {
    if (phase !== 'text' && phase !== 'image') return;
    const id = setInterval(() => {
      const start = runStartRef.current || Date.now();
      const elapsed = Date.now() - start;
      const target = PROGRESS_CAP * (1 - Math.exp(-elapsed / PROGRESS_TAU_MS));
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
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID 環境變數');
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
        await runAll(resolvedUid);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 一氣呵成：生文案 → 生圖 ────────────────────────────────
  async function runAll(lineUid: string) {
    setError('');
    setImageUrl('');
    setTextDone(false);
    setProgress(0);
    runStartRef.current = Date.now(); // 整輪從這裡開始計時

    // ① 生文案
    setPhase('text');
    const tRes = await fetch('/api/liff-festival/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_uid: lineUid }),
    });
    const tData = await tRes.json();
    if (!tRes.ok) {
      setError(`生文案失敗：${tData.error || `HTTP ${tRes.status}`}`);
      setPhase('error');
      return;
    }
    setTitle(tData.title || '');
    setContent(tData.content || '');
    setImagePrompt(tData.imagePrompt || '');
    setCustomerName(tData.customerName || '');
    setTextDone(true); // 文案真的完成（進度條不跳，繼續依時間爬）

    // ② 生圖（延續同一輪計時，不重置）
    await genImage(tData.imagePrompt || '', false);
  }

  // ── 生圖（restart=true 時單獨重生，重置計時）──────────────
  async function genImage(prompt: string, restart = true) {
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
      const r = await fetch('/api/liff-festival/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompt: prompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setImageUrl(d.dataUrl);
      setProgress(100); // 圖片真的回來 → 100%
      setPhase('ready');
    } catch (e) {
      setError(`生圖失敗：${msg(e)}`);
      setPhase('error');
    }
  }

  // ── 確認送出 ──────────────────────────────────────────────
  async function confirm() {
    if (!title.trim() || !content.trim() || !imageUrl) {
      setError('標題、內文、圖片都要有才能送出');
      return;
    }
    setError('');
    setConfirmLoading(true);
    try {
      const res = await fetch('/api/liff-festival/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: uid, title, content, imageDataUrl: imageUrl }),
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
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">草稿已存好</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-8">
          回到 LINE 對話，按<span className="font-semibold text-amber-700">「確認發佈」</span>就會發到你的社群。
        </p>
        <button
          onClick={closeLiff}
          className="px-8 py-3 rounded-full bg-amber-500 text-white font-semibold shadow-sm active:scale-95 transition"
        >
          回到 LINE
        </button>
      </div>
    );
  }

  // ── 生成中畫面（進度條）────────────────────────────────────
  if (phase === 'init' || phase === 'text' || phase === 'image') {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500 flex items-center justify-center text-3xl shadow-sm mb-4">
            🎨
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">節慶主題生圖</h1>
          <p className="text-xs text-gray-500 mb-8">
            {customerName ? `${customerName} · ` : ''}AI 正在幫你準備節慶貼文
          </p>

          {/* 進度條 */}
          <div className="w-full h-3 rounded-full bg-amber-100 overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-amber-700 font-medium">{PHASE_LABEL[phase]}</span>
            <span className="text-amber-600 font-semibold tabular-nums">{Math.round(progress)}%</span>
          </div>

          {/* 兩步驟指示 */}
          <div className="mt-8 flex items-center justify-center gap-6 text-xs">
            <StepDot label="生成文案" active={phase === 'text'} done={textDone} />
            <div className="w-8 h-px bg-amber-200" />
            <StepDot label="生成配圖" active={phase === 'image'} done={progress >= 100} />
          </div>
        </div>
      </div>
    );
  }

  // ── 結果畫面（ready / error）──────────────────────────────
  return (
    <div className="min-h-screen bg-amber-50">
      <div className="w-full max-w-md mx-auto px-5 py-6">
        <header className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center text-2xl shadow-sm">
            🎨
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">節慶主題生圖</h1>
            <p className="text-xs text-gray-500">
              {customerName ? `${customerName} · ` : ''}確認內容後送出存草稿
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 錯誤時給重試 */}
        {phase === 'error' && (
          <button
            onClick={() => uid && runAll(uid)}
            className="w-full mb-5 py-3 rounded-2xl bg-amber-500 text-white font-semibold shadow-sm active:scale-95 transition"
          >
            ↻ 重新生成
          </button>
        )}

        {phase === 'ready' && (
          <>
            {/* 配圖 */}
            <section className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400">配圖</p>
                <button
                  onClick={() => genImage(imagePrompt)}
                  className="text-xs text-amber-600 font-medium"
                >
                  ↻ 重新生成圖片
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="節慶配圖" className="w-full rounded-xl" />
            </section>

            {/* 文案（可編輯）*/}
            <section className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400">貼文文案（可直接修改）</p>
                <button
                  onClick={() => uid && runAll(uid)}
                  className="text-xs text-amber-600 font-medium"
                >
                  ↻ 換一篇
                </button>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="標題"
                className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200 font-bold text-gray-900 focus:outline-none focus:border-amber-400"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="貼文內容"
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 leading-relaxed resize-none focus:outline-none focus:border-amber-400"
              />
            </section>

            {/* 確認送出 */}
            <button
              onClick={confirm}
              disabled={confirmLoading}
              className="w-full py-4 rounded-2xl bg-amber-500 text-white font-semibold text-base shadow-sm active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
            >
              {confirmLoading ? '存檔中…' : '✅ 確認使用這篇＋這張圖'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// 兩步驟小圓點指示
function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
          done
            ? 'bg-amber-500 text-white'
            : active
              ? 'bg-amber-200 text-amber-700 animate-pulse'
              : 'bg-amber-100 text-amber-400'
        }`}
      >
        {done ? '✓' : active ? '…' : '•'}
      </div>
      <span className={active || done ? 'text-amber-700 font-medium' : 'text-gray-400'}>{label}</span>
    </div>
  );
}
