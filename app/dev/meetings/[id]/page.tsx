'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import Link from 'next/link';
import DeleteMeetingButton from './DeleteMeetingButton';

const MEMBERS = ['nana', 'todd', 'steven', 'emma'] as const;

const AVATAR_COLOR: Record<string, string> = {
  nana:   'bg-rose-100 text-rose-600',
  todd:   'bg-sky-100 text-sky-600',
  steven: 'bg-violet-100 text-violet-600',
  emma:   'bg-amber-100 text-amber-600',
};

const MEMBER_ACTIVE: Record<string, string> = {
  nana:   'border-rose-500 bg-rose-500 text-white shadow-md',
  todd:   'border-sky-500 bg-sky-500 text-white shadow-md',
  steven: 'border-violet-500 bg-violet-500 text-white shadow-md',
  emma:   'border-amber-500 bg-amber-500 text-white shadow-md',
};

const EXTRA_COLORS = [
  'border-teal-500 bg-teal-500 text-white shadow-md',
  'border-orange-500 bg-orange-500 text-white shadow-md',
  'border-pink-500 bg-pink-500 text-white shadow-md',
  'border-lime-500 bg-lime-500 text-white shadow-md',
  'border-cyan-500 bg-cyan-500 text-white shadow-md',
];

interface Meeting {
  id: number; title: string; date: string; attendees: string[]; content: string; created_at: string;
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // 編輯表單狀態
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/dev/meetings?id=${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setMeeting(data); setLoading(false); });
  }, [id]);

  function enterEdit() {
    if (!meeting) return;
    setTitle(meeting.title);
    setDate(meeting.date);
    setContent(meeting.content);
    const fixedInAttendees = meeting.attendees.filter(a => MEMBERS.includes(a as typeof MEMBERS[number]));
    setSelected(new Set(fixedInAttendees));
    setExtras(meeting.attendees.filter(a => !MEMBERS.includes(a as typeof MEMBERS[number])));
    setEditing(true);
  }

  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function handleExtraKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = extraInput.trim();
    if (!name || extras.includes(name) || MEMBERS.includes(name as typeof MEMBERS[number])) {
      setExtraInput('');
      return;
    }
    setExtras(prev => [...prev, name]);
    setExtraInput('');
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const attendees = [...Array.from(selected), ...extras];
    const res = await fetch('/api/dev/meetings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), title, date, attendees, content }),
    });
    if (res.ok) {
      const updated = await fetch(`/api/dev/meetings?id=${id}`).then(r => r.json());
      setMeeting(updated);
      setEditing(false);
    }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">載入中…</div>;
  if (!meeting) return notFound();

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dev/meetings" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← 返回列表
        </Link>
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              onClick={enterEdit}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              編輯
            </button>
          )}
          <DeleteMeetingButton id={meeting.id} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 to-blue-400" />

        <div className="p-8">
          {editing ? (
            /* ── 編輯模式 ── */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">會議標題</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">日期</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">出席人員</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {MEMBERS.map(name => {
                    const active = selected.has(name);
                    return (
                      <button key={name} type="button" onClick={() => toggle(name)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${active ? MEMBER_ACTIVE[name] : 'border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                        {active && <span className="mr-1">✓</span>}{name}
                      </button>
                    );
                  })}
                  {extras.map((name, i) => (
                    <button key={name} type="button" onClick={() => setExtras(p => p.filter(n => n !== name))}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${EXTRA_COLORS[i % EXTRA_COLORS.length]}`}>
                      {name} <span className="ml-1 opacity-70">✕</span>
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={extraInput}
                  onChange={e => setExtraInput(e.target.value)}
                  onKeyDown={handleExtraKeyDown}
                  placeholder="輸入其他出席者，按 Enter 新增"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">會議內容</label>
                <textarea
                  rows={10}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button onClick={handleSave} disabled={saving || !title.trim()}
                  className="flex-1 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {saving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          ) : (
            /* ── 閱讀模式 ── */
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold leading-none">W</span>
                </div>
                <span className="text-sm text-gray-400">{meeting.date}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-5">{meeting.title}</h1>
              {meeting.attendees.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">出席人員</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {meeting.attendees.map(name => (
                      <span key={name} className={`text-xs font-medium px-2 py-1 rounded-lg ${AVATAR_COLOR[name] ?? 'bg-gray-100 text-gray-600'}`}>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <hr className="border-gray-100 mb-6" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">會議內容</p>
                {meeting.content
                  ? <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{meeting.content}</p>
                  : <p className="text-sm text-gray-300">無內容記錄</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
