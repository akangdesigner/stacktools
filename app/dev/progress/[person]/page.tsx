'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, notFound } from 'next/navigation';
import Link from 'next/link';

interface CurrentTask {
  id: number; person: string; title: string; content: string; note: string; created_at: string;
}
interface CompletedTask {
  id: number; person: string; title: string; content: string; note: string; completed_at: string; created_at: string;
}

const MEMBERS = ['nana', 'todd', 'steven', 'emma'];
const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

const ACCENT: Record<string, { avatar: string; bar: string; ring: string }> = {
  nana:   { avatar: 'bg-[#E8496A]', bar: 'bg-[#E8496A]', ring: 'ring-[#E8496A]/20' },
  todd:   { avatar: 'bg-[#2B8CC4]', bar: 'bg-[#2B8CC4]', ring: 'ring-[#2B8CC4]/20' },
  steven: { avatar: 'bg-[#7C5CBF]', bar: 'bg-[#7C5CBF]', ring: 'ring-[#7C5CBF]/20' },
  emma:   { avatar: 'bg-[#D97706]', bar: 'bg-[#D97706]', ring: 'ring-[#D97706]/20' },
};

function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatGroupDate(dateStr: string) {
  const d   = new Date(dateStr + 'T12:00:00');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}  ${DAYS_SHORT[d.getDay()]}`;
}

export default function PersonProgressPage() {
  const { person } = useParams<{ person: string }>();
  const [current,   setCurrent]   = useState<CurrentTask[]>([]);
  const [completed, setCompleted] = useState<CompletedTask[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [showForm,   setShowForm]   = useState(false);
  const [title,      setTitle]      = useState('');
  const [content,    setContent]    = useState('');
  const [note,       setNote]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editId,      setEditId]      = useState<number | null>(null);
  const [editTitle,   setEditTitle]   = useState('');
  const [editContent, setEditContent] = useState('');
  const [editNote,    setEditNote]    = useState('');
  const [editDate,    setEditDate]    = useState('');
  const [saving,      setSaving]      = useState(false);

  if (!MEMBERS.includes(person)) notFound();

  const load = useCallback(async () => {
    const res  = await fetch('/api/dev/progress');
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
    setShowForm(false); setSubmitting(false);
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
    if (!confirm('確定要刪除這筆記錄嗎？')) return;
    await fetch('/api/dev/progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type }),
    });
    load();
  }

  function startEdit(task: CompletedTask) {
    setEditId(task.id);
    setEditTitle(task.title);
    setEditContent(task.content);
    setEditNote(task.note);
    setEditDate(task.completed_at.slice(0, 10));
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setSaving(true);
    await fetch('/api/dev/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, title: editTitle.trim(), content: editContent.trim(), note: editNote.trim(), completed_at: editDate }),
    });
    setSaving(false); setEditId(null);
    load();
  }

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })();
  const todayCount = completed.filter(t => t.completed_at.startsWith(today)).length;
  const weekCount  = completed.filter(t => t.completed_at.slice(0, 10) >= weekAgo).length;

  // 7-day bar chart
  const last7 = getLast7Days();
  const barData = last7.map(date => ({
    date,
    count: completed.filter(t => t.completed_at.startsWith(date)).length,
    dayLabel: DAYS_SHORT[new Date(date + 'T12:00:00').getDay()].slice(0, 1),
  }));
  const maxBar = Math.max(...barData.map(b => b.count), 1);

  // Completed grouped by date
  const grouped = completed.reduce((acc, t) => {
    const date = t.completed_at.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, CompletedTask[]>);
  const dates = Object.keys(grouped).sort().reverse();

  const accent = ACCENT[person] ?? { avatar: 'bg-gray-400', bar: 'bg-gray-400', ring: '' };

  return (
    <div className="p-8 max-w-5xl">

      {/* Back */}
      <Link
        href="/dev/progress"
        className="inline-block text-[10px] font-mono tracking-[0.15em] text-gray-400 hover:text-gray-600 transition-colors mb-6 uppercase"
      >
        ← 全部成員
      </Link>

      {/* Dashboard header */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">

          {/* Member identity */}
          <div className="flex items-center gap-4 md:w-48 shrink-0">
            <div className={`w-12 h-12 rounded-xl ${accent.avatar} ring-4 ${accent.ring} flex items-center justify-center`}>
              <span className="text-white text-lg font-black uppercase">{person[0]}</span>
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 uppercase tracking-widest">{person}</h1>
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wide">開發進度</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col sm:flex-row gap-4">
            {/* KPI strip */}
            <div className="flex gap-4 sm:gap-6">
              {[
                { value: current.length, label: 'IN PROGRESS' },
                { value: todayCount,     label: 'TODAY' },
                { value: weekCount,      label: '7 DAYS' },
              ].map(k => (
                <div key={k.label}>
                  <p className="text-2xl font-bold font-mono tabular-nums text-gray-900">{k.value}</p>
                  <p className="text-[9px] font-mono tracking-[0.15em] text-gray-400 uppercase mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* 7-day bar chart */}
            <div className="flex-1 flex items-end justify-end gap-1.5">
              {barData.map(bar => (
                <div key={bar.date} className="flex flex-col items-center gap-1">
                  <div
                    className="w-5 bg-gray-100 rounded-sm flex items-end overflow-hidden"
                    style={{ height: '36px' }}
                  >
                    <div
                      className={`w-full ${accent.bar} opacity-80 rounded-sm transition-all duration-500`}
                      style={{ height: bar.count > 0 ? `${(bar.count / maxBar) * 100}%` : '0%', minHeight: bar.count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-gray-300 tabular-nums">{bar.dayLabel}</span>
                </div>
              ))}
              <span className="text-[9px] font-mono text-gray-300 uppercase pb-4 pl-1">7d</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* LEFT: In Progress */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-[0.2em] text-gray-400 uppercase">In Progress</span>
              {current.length > 0 && (
                <span className="text-[10px] font-mono font-bold text-gray-600 bg-gray-100 rounded-full px-1.5 py-0.5">{current.length}</span>
              )}
            </div>
            <button
              onClick={() => { setShowForm(v => !v); setTitle(''); setContent(''); setNote(''); }}
              className="text-[11px] font-mono text-gray-400 hover:text-gray-700 transition-colors"
            >
              {showForm ? '— 取消' : '＋ 新增'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAdd} className="mb-4 border border-dashed border-gray-200 rounded-xl p-4 space-y-2 bg-gray-50">
              <input
                autoFocus
                type="text"
                placeholder="任務標題"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full text-sm font-medium text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
              />
              <textarea
                placeholder="任務內容（選填）"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={2}
                className="w-full text-sm text-gray-500 bg-transparent outline-none resize-none placeholder:text-gray-300"
              />
              <input
                type="text"
                placeholder="備註（選填）"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full text-xs text-gray-400 bg-transparent outline-none placeholder:text-gray-200"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="px-3 py-1.5 text-xs font-mono bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-30 transition-colors"
                >
                  新增
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-xs text-gray-300 font-mono py-4">loading…</p>
          ) : current.length === 0 && !showForm ? (
            <div className="py-8 text-center">
              <p className="text-xs text-gray-300 font-mono">— no active tasks</p>
            </div>
          ) : (
            <div className="space-y-1">
              {current.map(task => (
                <div
                  key={task.id}
                  className="group flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="mt-0.5 w-4 h-4 rounded border border-gray-200 shrink-0 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                    title="標記完成"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{task.title}</p>
                    {task.content && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap leading-relaxed">{task.content}</p>}
                    {task.note && <p className="text-xs text-gray-300 italic mt-0.5">{task.note}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(task.id, 'current')}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs font-mono shrink-0 pt-0.5 transition-all"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Completed log */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-mono tracking-[0.2em] text-gray-400 uppercase">Completed</span>
            {completed.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-gray-600 bg-gray-100 rounded-full px-1.5 py-0.5">{completed.length}</span>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-gray-300 font-mono py-4">loading…</p>
          ) : dates.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-gray-300 font-mono">— no completed tasks</p>
            </div>
          ) : (
            <div className="space-y-5 max-h-[520px] overflow-y-auto pr-1">
              {dates.map(date => (
                <div key={date}>
                  <p className="text-xs font-mono font-semibold text-gray-600 tabular-nums mb-2 uppercase tracking-wide">
                    {formatGroupDate(date)}
                  </p>
                  <div className="space-y-px pl-1">
                    {grouped[date].map(task => (
                      <div key={task.id}>
                        {editId === task.id ? (
                          <form onSubmit={handleSaveEdit} className="border border-dashed border-gray-200 rounded-xl p-3 space-y-2 mb-1 bg-gray-50">
                            <input
                              autoFocus
                              type="text"
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              className="w-full text-sm font-medium text-gray-900 bg-transparent outline-none"
                            />
                            <textarea
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              rows={2}
                              placeholder="任務內容"
                              className="w-full text-sm text-gray-500 bg-transparent outline-none resize-none placeholder:text-gray-300"
                            />
                            <input
                              type="text"
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder="備註"
                              className="w-full text-xs text-gray-400 bg-transparent outline-none placeholder:text-gray-200"
                            />
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-gray-400">完成日期</span>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={e => setEditDate(e.target.value)}
                                  className="text-xs text-gray-600 border border-gray-200 rounded px-2 py-0.5 bg-white outline-none font-mono"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setEditId(null)} className="text-xs font-mono text-gray-400 hover:text-gray-600">取消</button>
                                <button type="submit" disabled={saving || !editTitle.trim()} className="px-2.5 py-1 text-xs font-mono bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-30 transition-colors">儲存</button>
                              </div>
                            </div>
                          </form>
                        ) : (
                          <div className="group flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <span className="text-emerald-400 text-[11px] font-mono shrink-0 mt-0.5">✓</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-600">{task.title}</p>
                              {task.content && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap">{task.content}</p>}
                              {task.note && <p className="text-xs text-gray-300 italic mt-0.5">{task.note}</p>}
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 shrink-0 pt-0.5 transition-all">
                              <button onClick={() => startEdit(task)} className="text-[10px] font-mono text-gray-300 hover:text-gray-600 uppercase">編輯</button>
                              <button onClick={() => handleDelete(task.id, 'completed')} className="text-[10px] font-mono text-gray-300 hover:text-red-400">✕</button>
                            </div>
                          </div>
                        )}
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
