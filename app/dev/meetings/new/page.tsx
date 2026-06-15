'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MEMBERS = ['nana', 'todd', 'steven', 'emma'] as const;

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

export default function NewMeetingPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = input.trim();
    if (!name || extras.includes(name) || MEMBERS.includes(name as typeof MEMBERS[number])) {
      setInput('');
      return;
    }
    setExtras(prev => [...prev, name]);
    setInput('');
  }

  function removeExtra(name: string) {
    setExtras(prev => prev.filter(n => n !== name));
  }

  async function handleSave() {
    if (!title.trim()) { setError('請填寫會議標題'); return; }
    if (!date) { setError('請選擇日期'); return; }
    setSaving(true);
    setError('');
    const attendees = [...Array.from(selected), ...extras];
    const res = await fetch('/api/dev/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), date, attendees, content }),
    });
    if (res.ok) {
      router.push('/dev/meetings');
    } else {
      setError('儲存失敗，請再試一次');
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">新增會議記錄</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">會議標題</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例：技術週會 — Sprint 回顧"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">出席人員</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {MEMBERS.map(name => {
              const active = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                    active ? MEMBER_ACTIVE[name] : 'border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {active && <span className="mr-1">✓</span>}
                  {name}
                </button>
              );
            })}
            {extras.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => removeExtra(name)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${EXTRA_COLORS[i % EXTRA_COLORS.length]}`}
              >
                {name} <span className="ml-1 opacity-70">✕</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="輸入其他出席者，按 Enter 新增"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">會議內容</label>
          <textarea
            rows={8}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="討論事項、決議、待辦事項…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
