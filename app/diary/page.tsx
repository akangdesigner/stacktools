'use client';

import { useEffect, useState } from 'react';

interface Progress {
  id: number;
  tool: string;
  feature: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface Group {
  id: number;
  name: string;
  created_at: string;
}

interface Todo {
  id: number;
  group_id: number;
  title: string;
  note: string;
  done: number;
  created_at: string;
  done_at: string | null;
}

// 與首頁 app/page.tsx 工具卡片同步；下拉建議用，也可自行輸入未列出的名稱
const TOOL_NAMES = [
  '寫手流程工具',
  '文章上架工具',
  '精選知識文章',
  '推薦文生成器',
  'GSC 排名查詢',
  '社群貼文追蹤',
  '部落格文章生成',
  '財務發票管理',
  '訂閱費用監控',
  '會議記錄與開發進度',
  '開發日記',
  '客戶進度追蹤',
  '網頁改動追蹤',
  'AI 小編生成文章',
  'IG 監控報告',
  '銀髮 LINE 機器人',
  '美妝競品監控台',
  'TKD 現況產生器',
];

const STATUSES = ['規劃中', '開發中', '已上線', '暫停'];

const STATUS_STYLE: Record<string, string> = {
  規劃中: 'bg-gray-100 text-gray-600 border-gray-200',
  開發中: 'bg-amber-100 text-amber-700 border-amber-200',
  已上線: 'bg-green-100 text-green-700 border-green-200',
  暫停: 'bg-red-50 text-red-500 border-red-200',
};

type Tab = 'progress' | 'todos';

export default function DiaryPage() {
  const [tab, setTab] = useState<Tab>('progress');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'todos' || t === 'progress') setTab(t);
  }, []);

  function switchTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url.toString());
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📓 開發日記</h1>
        <p className="text-sm text-gray-500 mt-1">追蹤各工具的開發進度，記錄自己的待辦</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <TabButton active={tab === 'progress'} onClick={() => switchTab('progress')}>🛠️ 開發進度</TabButton>
        <TabButton active={tab === 'todos'} onClick={() => switchTab('todos')}>✅ 待辦</TabButton>
      </div>

      {tab === 'progress' ? <ProgressTab /> : <TodosTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
        active ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

// ── 開發進度分頁 ──────────────────────────────────────────────

function fmtDate(s: string) {
  return s.slice(0, 10);
}

function ProgressTab() {
  const [items, setItems] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch('/api/diary/progress');
    const data = await res.json();
    setItems(data.progress ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // 依工具分組，保留出現順序
  const groups: { tool: string; features: Progress[] }[] = [];
  const idx = new Map<string, number>();
  for (const it of items) {
    if (!idx.has(it.tool)) {
      idx.set(it.tool, groups.length);
      groups.push({ tool: it.tool, features: [] });
    }
    groups[idx.get(it.tool)!].features.push(it);
  }

  if (loading) return <p className="text-sm text-gray-400">載入中…</p>;

  return (
    <div className="space-y-4">
      <AddFeatureForm onChange={load} />
      {groups.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">還沒有任何工具進度，從上方新增一個功能吧 🛠️</p>
      ) : (
        groups.map((g) => (
          <ToolBlock key={g.tool} tool={g.tool} features={g.features} onChange={load} />
        ))
      )}
    </div>
  );
}

// 新增工具／功能（可選現有工具或自訂全新工具）
function AddFeatureForm({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState('');
  const [feature, setFeature] = useState('');
  const [status, setStatus] = useState('開發中');

  async function submit() {
    if (!tool.trim() || !feature.trim()) return;
    await fetch('/api/diary/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: tool.trim(), feature: feature.trim(), status }),
    });
    setFeature('');
    setOpen(false);
    onChange();
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700"
        >
          ＋ 新增工具／功能
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50/40 space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          placeholder="工具名稱（可選現有或自訂）"
          list="diary-tool-names"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:border-amber-400"
        />
        <datalist id="diary-tool-names">
          {TOOL_NAMES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <input
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="功能名稱"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:border-amber-400"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:border-amber-400"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!tool.trim() || !feature.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
        >
          新增
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100">
          取消
        </button>
      </div>
    </div>
  );
}

// 單一工具區塊：標題 + 完成統計 + 功能逐項 + 快速新增功能
function ToolBlock({ tool, features, onChange }: { tool: string; features: Progress[]; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const done = features.filter((f) => f.completed_at).length;

  async function addFeature(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch('/api/diary/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, feature: title.trim(), status: '開發中' }),
    });
    setTitle('');
    onChange();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="font-semibold text-gray-900 mb-3">
        {tool} <span className="text-xs font-normal text-gray-400">({done}/{features.length})</span>
      </h3>
      <ul className="space-y-1">
        {features.map((f) => (
          <FeatureRow key={f.id} item={f} onChange={onChange} />
        ))}
      </ul>
      <form onSubmit={addFeature} className="flex gap-2 mt-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="＋ 新增功能…"
          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400"
        />
        {title.trim() && (
          <button type="submit" className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 shrink-0">
            新增
          </button>
        )}
      </form>
    </div>
  );
}

// 單一功能列：打勾完成、改名、改狀態、刪除
function FeatureRow({ item, onChange }: { item: Progress; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.feature);
  const done = !!item.completed_at;

  async function patch(body: object) {
    await fetch('/api/diary/progress', {
      method: body && 'done' in body ? 'PATCH' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onChange();
  }

  async function toggle() {
    await patch({ id: item.id, done: !done });
  }

  async function changeStatus(status: string) {
    await patch({ id: item.id, tool: item.tool, feature: item.feature, status });
  }

  async function saveName() {
    setEditing(false);
    if (!name.trim() || name.trim() === item.feature) return;
    await patch({ id: item.id, tool: item.tool, feature: name.trim(), status: item.status });
  }

  async function remove() {
    await fetch('/api/diary/progress', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    onChange();
  }

  return (
    <li className="group flex items-center gap-2 py-1.5">
      <button
        onClick={toggle}
        title={done ? '取消完成' : '標記完成'}
        className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-500'
        }`}
      >
        {done ? '✓' : ''}
      </button>
      {editing ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && saveName()}
          autoFocus
          className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 text-sm cursor-text ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}
        >
          {item.feature}
        </span>
      )}
      {done ? (
        <span className="text-[11px] text-green-600 shrink-0">✅ 完成於 {fmtDate(item.completed_at!)}</span>
      ) : (
        <select
          value={item.status}
          onChange={(e) => changeStatus(e.target.value)}
          className={`text-xs px-2 py-0.5 rounded-full border bg-white ${STATUS_STYLE[item.status] ?? STATUS_STYLE['開發中']}`}
        >
          {STATUSES.filter((s) => s !== '已上線').map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
      <button
        onClick={remove}
        className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        刪除
      </button>
    </li>
  );
}

// ── 待辦分頁 ──────────────────────────────────────────────────

function TodosTab() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroup, setNewGroup] = useState('');

  async function load() {
    const res = await fetch('/api/diary/todos');
    const data = await res.json();
    setGroups(data.groups ?? []);
    setTodos(data.todos ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    await fetch('/api/diary/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroup }),
    });
    setNewGroup('');
    load();
  }

  if (loading) return <p className="text-sm text-gray-400">載入中…</p>;

  return (
    <div>
      <form onSubmit={addGroup} className="flex gap-2 mb-6">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          placeholder="新增區塊（案子名稱）"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-amber-400"
        />
        <button
          type="submit"
          disabled={!newGroup.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 shrink-0"
        >
          ＋ 新增區塊
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">先新增一個區塊，再開始記待辦吧</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} todos={todos.filter((t) => t.group_id === g.id)} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, todos, onChange }: { group: Group; todos: Todo[]; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  const pending = todos.filter((t) => t.done === 0);
  const done = todos.filter((t) => t.done === 1);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch('/api/diary/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: group.id, title }),
    });
    setTitle('');
    onChange();
  }

  async function toggle(id: number, value: boolean) {
    await fetch('/api/diary/todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, done: value }),
    });
    onChange();
  }

  async function removeTodo(id: number) {
    await fetch('/api/diary/todos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    onChange();
  }

  async function saveName() {
    if (!name.trim()) return;
    await fetch('/api/diary/groups', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: group.id, name }),
    });
    setRenaming(false);
    onChange();
  }

  async function removeGroup() {
    if (!confirm(`確定刪除「${group.name}」區塊？底下的待辦會一起刪除。`)) return;
    await fetch('/api/diary/groups', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: group.id }),
    });
    onChange();
  }

  function row(t: Todo) {
    return (
      <li key={t.id} className="group flex items-start gap-2 py-1.5">
        <button
          onClick={() => toggle(t.id, t.done === 0)}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
            t.done ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300 hover:border-amber-500'
          }`}
        >
          {t.done ? '✓' : ''}
        </button>
        <span className={`flex-1 text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.title}</span>
        <button
          onClick={() => removeTodo(t.id)}
          className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          刪除
        </button>
      </li>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        {renaming ? (
          <div className="flex gap-2 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm font-semibold"
              autoFocus
            />
            <button onClick={saveName} className="px-2 py-1 text-xs rounded bg-amber-600 text-white">儲存</button>
            <button onClick={() => { setName(group.name); setRenaming(false); }} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600">取消</button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900">
              {group.name} <span className="text-xs font-normal text-gray-400">({pending.length})</span>
            </h3>
            <div className="flex gap-1">
              <button onClick={() => setRenaming(true)} className="px-2 py-0.5 text-xs rounded text-gray-500 hover:bg-gray-100">改名</button>
              <button onClick={removeGroup} className="px-2 py-0.5 text-xs rounded text-red-500 hover:bg-red-50">刪除</button>
            </div>
          </>
        )}
      </div>

      {pending.length > 0 && <ul>{pending.map(row)}</ul>}

      <form onSubmit={addTodo} className="flex gap-2 mt-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="＋ 新增待辦…"
          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-amber-400"
        />
        {title.trim() && (
          <button type="submit" className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 shrink-0">
            新增
          </button>
        )}
      </form>

      {done.length > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <button onClick={() => setShowDone((v) => !v)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
            已完成 ({done.length}) {showDone ? '▾' : '▸'}
          </button>
          {showDone && <ul className="mt-1">{done.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
