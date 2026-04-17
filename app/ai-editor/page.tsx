'use client';

import { useEffect, useRef, useState } from 'react';

interface AiEditorJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  result?: {
    draftText?: string;
    draftImageUrl?: string;
    raw?: unknown;
  };
}

export default function AiEditorPage() {
  const [siteUrl, setSiteUrl] = useState('');
  const [socialAccount, setSocialAccount] = useState('');
  const [lineUid, setLineUid] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AiEditorJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ai-editor:settings');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        siteUrl?: string;
        socialAccount?: string;
        lineUid?: string;
      };
      setSiteUrl(parsed.siteUrl ?? '');
      setSocialAccount(parsed.socialAccount ?? '');
      setLineUid(parsed.lineUid ?? '');
    } catch {
      // ignore invalid localStorage data
    }
  }, []);

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

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeJobId]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(
      'ai-editor:settings',
      JSON.stringify({
        siteUrl: siteUrl.trim(),
        socialAccount: socialAccount.trim(),
        lineUid: lineUid.trim(),
      })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerError('');
    setJob(null);

    try {
      const res = await fetch('/api/ai-editor/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl,
          socialAccount,
          lineUid,
          articleUrl,
        }),
      });

      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        setTriggerError(data.error ?? '觸發失敗');
        return;
      }

      setActiveJobId(data.jobId);
    } catch (err) {
      setTriggerError(String(err));
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">AI 小編生成文章</h1>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">開發中</span>
        </div>
        <p className="text-sm text-gray-500">
          自動偵測官網最新文章，產生 AI 圖文草稿，傳至 LINE 讓業主審核，確認後自動上架社群。
        </p>
      </div>

      {/* 流程說明 */}
      <div className="flex items-start gap-0">
        {[
          { step: '1', label: '偵測新文章', desc: '監控官網，有新文章即觸發' },
          { step: '2', label: 'AI 生成圖文', desc: '自動產生標題、內文與配圖' },
          { step: '3', label: 'LINE 審核', desc: '草稿傳至業主 LINE 確認' },
          { step: '4', label: '自動上架', desc: '核准後發布至各社群帳號' },
        ].map((item, i, arr) => (
          <div key={item.step} className="flex items-center flex-1">
            <div className="flex flex-col items-center text-center flex-1">
              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 text-sm font-bold flex items-center justify-center mb-1.5">
                {item.step}
              </div>
              <p className="text-xs font-medium text-gray-600">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{item.desc}</p>
            </div>
            {i < arr.length - 1 && (
              <div className="w-6 shrink-0 border-t-2 border-dashed border-gray-200 mb-6" />
            )}
          </div>
        ))}
      </div>

      {/* 設定表單 */}
      <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-800">基本設定</h2>

        {/* 官網網址 */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-600" htmlFor="siteUrl">
            官網網址
          </label>
          <input
            id="siteUrl"
            type="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://www.example.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-300"
          />
          <p className="text-xs text-gray-400">AI 小編會定期掃描此網址，找到新文章後自動觸發</p>
        </div>

        {/* 社群帳號與權限 */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-600" htmlFor="socialAccount">
            社群帳號與權限
          </label>
          <textarea
            id="socialAccount"
            value={socialAccount}
            onChange={(e) => setSocialAccount(e.target.value)}
            rows={3}
            placeholder={`IG: @帳號名稱（需授權發文）\nFB: 粉專名稱（需管理員權限）`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-300 resize-none"
          />
          <p className="text-xs text-gray-400">列出要自動上架的帳號，每行一個</p>
        </div>

        {/* LINE UID */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-600" htmlFor="lineUid">
            LINE UID（審核通知）
          </label>
          <input
            id="lineUid"
            type="text"
            value={lineUid}
            onChange={(e) => setLineUid(e.target.value)}
            placeholder="U1234567890abcdef..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-300"
          />
          <p className="text-xs text-gray-400">草稿產生後，系統會透過 LINE 傳送預覽給此 UID，由業主點選核准或重生</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            儲存設定
          </button>
          {saved && <span className="text-xs text-emerald-600">✓ 已儲存</span>}
        </div>
      </form>

      {/* 觸發區（佔位） */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <p className="text-sm font-semibold text-gray-800">手動觸發</p>
        <p className="text-xs text-gray-400">可指定單篇文章網址，立即送到 n8n 產生 AI 草稿。</p>
        <input
          type="url"
          value={articleUrl}
          onChange={(e) => setArticleUrl(e.target.value)}
          placeholder="https://www.example.com/blog/your-article"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 placeholder-gray-300"
        />
        <button
          onClick={handleTrigger}
          disabled={triggering || !!activeJobId}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {triggering ? '送出中…' : activeJobId ? '處理中…' : '立即產生草稿'}
        </button>
        {triggerError && <p className="text-xs text-red-600">{triggerError}</p>}
        {job && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
            <p className="text-xs text-gray-500">任務狀態：<span className="font-medium text-gray-700">{job.status}</span></p>
            <p className="text-sm text-gray-700">{job.message}</p>
            {job.result?.draftText && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">草稿文字</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-56 overflow-auto">{job.result.draftText}</pre>
              </div>
            )}
            {job.result?.draftImageUrl && (
              <a
                href={job.result.draftImageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-blue-600 hover:underline"
              >
                開啟草稿圖片
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
