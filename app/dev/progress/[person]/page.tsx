'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, notFound } from 'next/navigation';

interface CurrentTask {
  id: number; person: string; title: string; content: string; note: string; created_at: string;
}
interface CompletedTask {
  id: number; person: string; title: string; content: string; note: string; completed_at: string; created_at: string;
}

const MEMBERS = ['nana', 'todd', 'steven', 'emma'];

const ACCENT: Record<string, string> = {
  nana:   'border-rose-400 text-rose-500',
  todd:   'border-sky-400 text-sky-500',
  steven: 'border-violet-400 text-violet-500',
  emma:   'border-amber-400 text-amber-500',
};

export default function PersonProgressPage() {
  const { person } = useParams<{ person: string }>();
  const [current, setCurrent] = useState<CurrentTask[]>([]);
  const [completed, setCompleted] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!MEMBERS.includes(person)) notFound();

  const load = useCallback(async () => {
    const res = await fetch('/api/dev/progress');
    const data = await res.json();
    setCurrent(data.current.filter((t: CurrentTask) => t.person === person));
    setCompleted(data.completed.filter((t: CompletedTask) => t.person === person));
    setLoading(false);
  }, [person]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await fetch('/api/dev/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person, title: title.trim(), content: content.trim(), note: note.trim() }),
    });
    setTitle(''); setContent(''); setNote('');
    setShowForm(false);
    setSubmitting(false);
    load();
  }

  async function handleComplete(id: number) {
    await fetch('/api/dev/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function handleDelete(id: number, type: 'current' | 'completed') {
    await fetch('/api/dev/progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type }),
    });
    load();
  }

  const grouped = completed.reduce((acc, t) => {
    const date = t.completed_at.split(' ')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, CompletedTask[]>);
  const dates = Object.keys(grouped).sort().reverse();

  const accentCls = ACCENT[person] ?? 'border-gray-300 text-gray-500';

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className={`text-2xl font-bold uppercase tracking-wide border-b-2 pb-1 inline-block ${accentCls}`}>
            {person}
          </h1>
          <p className="text-sm text-gray-400 mt-1">任務管理</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setTitle(''); setContent(''); setNote(''); }}
          className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          {showForm ? '取消' : '＋ 新增任務'}
        </button>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
          <input
            type="text"
            placeholder="任務標題 *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <textarea
            placeholder="任務內容（選填）"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
          />
          <input
            type="text"
            placeholder="備註（選填）"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            新增
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 當前任務 */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            當前任務 <span className="text-gray-600 font-bold">{current.length}</span>
          </h2>
          {loading ? (
            <p className="text-sm text-gray-300 py-6 text-center">載入中…</p>
          ) : current.length === 0 ? (
            <p className="text-sm text-gray-300 py-6 text-center">無進行中任務</p>
          ) : (
            <div className="space-y-2">
              {current.map(task => (
                <div key={task.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <p className="text-sm font-semibold text-gray-900 mb-1">{task.title}</p>
                  {task.content && (
                    <p className="text-xs text-gray-500 mb-1 whitespace-pre-wrap leading-relaxed">{task.content}</p>
                  )}
                  {task.note && (
                    <p className="text-xs text-gray-400 italic">{task.note}</p>
                  )}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="flex-1 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      ✓ 完成
                    </button>
                    <button
                      onClick={() => handleDelete(task.id, 'current')}
                      className="px-3 py-1 text-xs text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 完成事項 */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            完成事項 <span className="text-gray-600 font-bold">{completed.length}</span>
          </h2>
          {loading ? (
            <p className="text-sm text-gray-300 py-6 text-center">載入中…</p>
          ) : dates.length === 0 ? (
            <p className="text-sm text-gray-300 py-6 text-center">尚無完成事項</p>
          ) : (
            <div className="space-y-4">
              {dates.map(date => (
                <div key={date}>
                  <p className="text-xs text-gray-400 font-medium mb-2">{date}</p>
                  <div className="space-y-1.5">
                    {grouped[date].map(task => (
                      <div key={task.id} className="flex items-start gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        <span className="text-emerald-400 text-xs mt-0.5 shrink-0">✓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">{task.title}</p>
                          {task.content && <p className="text-xs text-gray-400 mt-0.5">{task.content}</p>}
                          {task.note && <p className="text-xs text-gray-400 italic mt-0.5">{task.note}</p>}
                        </div>
                        <button
                          onClick={() => handleDelete(task.id, 'completed')}
                          className="text-gray-200 hover:text-gray-400 text-xs shrink-0 pt-0.5 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
