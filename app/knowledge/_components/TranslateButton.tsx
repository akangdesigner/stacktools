'use client';

import { useState } from 'react';

interface Props {
  title: string;
  content: string;
}

export default function TranslateButton({ title, content }: Props) {
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

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2">
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

      {state === 'done' && showTranslated && translated && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-8">
          <div className="flex items-center gap-2 text-xs text-amber-500 mb-4">
            <span>🌐</span><span>機器翻譯（中文）</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-6">{translated.title}</h2>
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: translated.content }}
          />
        </div>
      )}
    </div>
  );
}
