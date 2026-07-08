'use client';

import { useEffect, useRef, useState } from 'react';
import type { Liff } from '@line/liff';

// 節慶生圖 LIFF 頁：文案（n8n 生成鏈，提示詞不變）＋生圖（gpt-5.4-image-2）都在網頁裡完成，
// 擺脫 LINE 訊息排版與 loading 60 秒限制。確認後回寫 Sheet 草稿，回 LINE 照舊發佈。

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';

type Step = 'booting' | 'text' | 'image' | 'confirm' | 'done';

export default function FestivalLiffPage() {
  const [step, setStep] = useState<Step>('booting');
  const [uid, setUid] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [textLoading, setTextLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');
  const liffRef = useRef<Liff | null>(null);

  // ── 啟動：liff init → 取 uid → 自動生文案 ──────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 測試後門：網址帶 ?uid=xxx 就直接用（一般瀏覽器不進 LINE 也能測）
        const qsUid = new URLSearchParams(window.location.search).get('uid');
        let resolvedUid = qsUid || '';

        if (!resolvedUid) {
          if (!LIFF_ID) throw new Error('尚未設定 NEXT_PUBLIC_LIFF_ID 環境變數');
          const liff = (await import('@line/liff')).default;
          liffRef.current = liff;
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) {
            liff.login();
            return; // 導去登入，回來會重跑
          }
          const profile = await liff.getProfile();
          resolvedUid = profile.userId;
        }

        if (cancelled) return;
        setUid(resolvedUid);
        await generateText(resolvedUid);
      } catch (e) {
        if (!cancelled) setError(`初始化失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 生文案（打 n8n 生成鏈）────────────────────────────────
  async function generateText(lineUid: string) {
    setError('');
    setTextLoading(true);
    setStep('text');
    try {
      const res = await fetch('/api/liff-festival/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_uid: lineUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTitle(data.title || '');
      setContent(data.content || '');
      setImagePrompt(data.imagePrompt || '');
      setCustomerName(data.customerName || '');
      setImageUrl(''); // 換文案就清掉舊圖
    } catch (e) {
      setError(`生文案失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTextLoading(false);
    }
  }

  // ── 生圖（打 OpenRouter gpt-5.4-image-2）──────────────────
  async function generateImage() {
    if (!imagePrompt) {
      setError('沒有圖片提示詞，請先重新生成文案');
      return;
    }
    setError('');
    setImageLoading(true);
    setStep('image');
    try {
      const res = await fetch('/api/liff-festival/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setImageUrl(data.dataUrl);
    } catch (e) {
      setError(`生圖失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImageLoading(false);
    }
  }

  // ── 確認送出（回寫 Sheet 草稿）────────────────────────────
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
      setStep('done');
    } catch (e) {
      setError(`送出失敗：${e instanceof Error ? e.message : String(e)}`);
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
  if (step === 'done') {
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

  const booting = step === 'booting';

  return (
    <div className="min-h-screen bg-amber-50">
      <div className="w-full max-w-md mx-auto px-5 py-6">
        {/* 標題列 */}
        <header className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center text-2xl shadow-sm">
            🎨
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">節慶主題生圖</h1>
            <p className="text-xs text-gray-500">
              {customerName ? `${customerName} · ` : ''}AI 幫你生節慶貼文與配圖
            </p>
          </div>
        </header>

        {/* 錯誤訊息 */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 啟動中 */}
        {booting && <LoadingBlock label="連線中…" />}

        {/* 文案區 */}
        {!booting && (
          <section className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400">貼文文案（可直接修改）</p>
              <button
                onClick={() => uid && generateText(uid)}
                disabled={textLoading}
                className="text-xs text-amber-600 font-medium disabled:opacity-40"
              >
                ↻ 換一篇
              </button>
            </div>

            {textLoading ? (
              <LoadingBlock label="AI 生成文案中…" />
            ) : (
              <>
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
              </>
            )}
          </section>
        )}

        {/* 圖片區 */}
        {!booting && !textLoading && (
          <section className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 mb-3">配圖</p>

            {imageLoading ? (
              <div className="py-8">
                <LoadingBlock label="AI 生圖中，約 2～3 分鐘，請別關閉頁面…" />
              </div>
            ) : imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="節慶配圖" className="w-full rounded-xl mb-3" />
                <button
                  onClick={generateImage}
                  className="w-full py-2.5 rounded-lg border border-amber-300 text-amber-600 text-sm font-medium active:scale-95 transition"
                >
                  ↻ 重新生成圖片
                </button>
              </>
            ) : (
              <button
                onClick={generateImage}
                className="w-full py-3 rounded-xl bg-amber-100 text-amber-700 font-semibold active:scale-95 transition"
              >
                🖼️ 生成配圖
              </button>
            )}
          </section>
        )}

        {/* 確認送出 */}
        {!booting && !textLoading && (
          <button
            onClick={confirm}
            disabled={!imageUrl || confirmLoading}
            className="w-full py-4 rounded-2xl bg-amber-500 text-white font-semibold text-base shadow-sm active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
          >
            {confirmLoading ? '存檔中…' : '✅ 確認使用這篇＋這張圖'}
          </button>
        )}
        {!booting && !imageUrl && !imageLoading && (
          <p className="mt-2 text-center text-xs text-gray-400">先生成一張配圖才能送出</p>
        )}
      </div>
    </div>
  );
}

// 共用 loading 動畫
function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-amber-600 py-4">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.2s]" />
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.1s]" />
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-bounce" />
      <span className="ml-2 text-sm">{label}</span>
    </div>
  );
}
