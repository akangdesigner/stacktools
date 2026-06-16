'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DAYS_SHORT = ['日','一','二','三','四','五','六'];

function formatTaskDate(dateStr: string) {
  const d  = new Date(dateStr + 'T12:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}（週${DAYS_SHORT[d.getDay()]}）`;
}

interface Props {
  id: number;
  title: string;
  content: string;
  completedAt: string;
}

export default function CompletedItem({ id, title, content, completedAt }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date,    setDate]    = useState(completedAt.slice(0, 10));
  const [saving,  setSaving]  = useState(false);

  async function saveDate(newDate: string) {
    if (newDate === completedAt.slice(0, 10)) { setEditing(false); return; }
    setSaving(true);
    await fetch('/api/dev/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, content, note: '', completed_at: newDate }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="flex items-start gap-3 min-w-0 py-0.5">
      {/* Date — click to edit */}
      <div className="shrink-0 w-[7.5rem] pt-0.5">
        {editing ? (
          <input
            type="date"
            autoFocus
            value={date}
            disabled={saving}
            onChange={e => setDate(e.target.value)}
            onBlur={e => saveDate(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') saveDate(date);
              if (e.key === 'Escape') setEditing(false);
            }}
            className="text-[10px] font-mono text-gray-500 border border-gray-200 rounded px-1 py-0.5 bg-white outline-none w-full"
          />
        ) : (
          <button
            onClick={e => { e.preventDefault(); setEditing(true); }}
            className="text-xs font-mono font-medium text-gray-500 tabular-nums hover:text-blue-400 transition-colors text-left"
            title="點擊編輯日期"
          >
            {formatTaskDate(completedAt.slice(0, 10))}
          </button>
        )}
      </div>

      {/* Title + content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{title}</p>
        {content && (
          <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap leading-relaxed">{content}</p>
        )}
      </div>
    </div>
  );
}
