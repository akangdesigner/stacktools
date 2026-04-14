'use client';

import { useState } from 'react';

interface Props {
  title: string;
  content: string;
  publishedAt?: string;
  sourceUrl?: string;
}

export default function ArticleBody({ title, content, publishedAt, sourceUrl }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [translated, setTranslated] = useState<{ title: string; content: string } | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);

  async function handleTranslate() {
    setState('loading');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranslated(data);
      setState('done');
      setShowTranslated(true);
    } catch {
      setState('error');
    }
  }

  const displayTitle = showTranslated && translated ? translated.title : title;
  const displayContent = showTranslated && translated ? translated.content : content;

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{displayTitle}</h1>
      <div className="flex gap-3 text-xs text-gray-400 mb-4">
        {publishedAt && <span>{publishedAt}</span>}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            原始來源 ↗
          </a>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6">
        {state !== 'done' ? (
          <button
            onClick={handleTranslate}
            disabled={state === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            {state === 'loading' ? '翻譯中…' : '🌐 翻譯成中文'}
          </button>
        ) : (
          <button
            onClick={() => setShowTranslated(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-200 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
          >
            {showTranslated ? '顯示原文' : '顯示譯文'}
          </button>
        )}
        {state === 'error' && <span className="text-xs text-red-400">翻譯失敗，請稍後再試</span>}
      </div>

      <div
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: displayContent }}
      />
    </>
  );
}
