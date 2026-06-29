'use client';

import { useEffect, useState } from 'react';

interface SilverUser {
  userId: string;
  nickname: string | null;
  age: number | null;
  gender: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserNote {
  id: number;
  userId: string;
  category: string;
  content: string;
  createdAt: string;
}

interface HealthEvent {
  id: number;
  userId: string;
  type: 'symptom' | 'medication';
  description: string;
}

interface RecurringReminder {
  id: number;
  userId: string;
  description: string;
  daysOfWeek: string;
}

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

const GENDER_LABEL: Record<string, string> = {
  male: '男',
  female: '女',
};

const NOTE_CATEGORY_LABEL: Record<string, string> = {
  family: '家庭',
  occupation: '職業',
  interest: '興趣',
  location: '居住地',
  other: '其他',
};

export default function SilverUsersPage() {
  const [users, setUsers] = useState<SilverUser[]>([]);
  const [notesByUser, setNotesByUser] = useState<Record<string, UserNote[]>>({});
  const [healthByUser, setHealthByUser] = useState<Record<string, HealthEvent[]>>({});
  const [recurringByUser, setRecurringByUser] = useState<Record<string, RecurringReminder[]>>({});
  const [loading, setLoading] = useState(true);
  // 編輯中的用戶 userId（null 代表沒有卡片在編輯）與編輯表單暫存值
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ nickname: string; age: string; gender: string }>({ nickname: '', age: '', gender: '' });

  useEffect(() => {
    Promise.all([
      fetch('/api/silver/users').then((res) => res.json()),
      fetch('/api/silver/notes').then((res) => res.json()),
      fetch('/api/silver/health-events/due').then((res) => res.json()),
      fetch('/api/silver/recurring-reminders').then((res) => res.json()),
    ])
      .then(([usersData, notesData, healthData, recurringData]) => {
        setUsers(usersData.users ?? []);

        const notesGrouped: Record<string, UserNote[]> = {};
        for (const note of (notesData.notes ?? []) as UserNote[]) {
          (notesGrouped[note.userId] ??= []).push(note);
        }
        setNotesByUser(notesGrouped);

        const healthGrouped: Record<string, HealthEvent[]> = {};
        for (const entry of (healthData.users ?? []) as { userId: string; events: HealthEvent[] }[]) {
          healthGrouped[entry.userId] = entry.events;
        }
        setHealthByUser(healthGrouped);

        const recurringGrouped: Record<string, RecurringReminder[]> = {};
        for (const reminder of (recurringData.reminders ?? []) as RecurringReminder[]) {
          (recurringGrouped[reminder.userId] ??= []).push(reminder);
        }
        setRecurringByUser(recurringGrouped);
      })
      .finally(() => setLoading(false));
  }, []);

  function removeNote(userId: string, id: number) {
    setNotesByUser((prev) => ({ ...prev, [userId]: (prev[userId] ?? []).filter((n) => n.id !== id) }));
    fetch(`/api/silver/notes?id=${id}`, { method: 'DELETE' });
  }

  function resolveEvent(userId: string, id: number) {
    setHealthByUser((prev) => ({ ...prev, [userId]: (prev[userId] ?? []).filter((e) => e.id !== id) }));
    fetch('/api/silver/health-events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'resolve' }),
    });
  }

  function removeRecurring(userId: string, id: number) {
    setRecurringByUser((prev) => ({ ...prev, [userId]: (prev[userId] ?? []).filter((r) => r.id !== id) }));
    fetch(`/api/silver/recurring-reminders?id=${id}`, { method: 'DELETE' });
  }

  // 開始編輯：把該用戶現有資料載入表單
  function startEdit(u: SilverUser) {
    setEditingId(u.userId);
    setEditForm({ nickname: u.nickname ?? '', age: u.age?.toString() ?? '', gender: u.gender ?? '' });
  }

  // 儲存編輯：PATCH 到後端並更新畫面
  async function saveEdit(userId: string) {
    const nickname = editForm.nickname.trim() || null;
    const age = editForm.age.trim() ? Number(editForm.age) : null;
    const gender = editForm.gender || null;
    await fetch('/api/silver/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname, age, gender }),
    });
    setUsers((prev) => prev.map((u) => (u.userId === userId ? { ...u, nickname, age, gender } : u)));
    setEditingId(null);
  }

  // 刪除用戶：確認後 DELETE，連同關聯資料一起清掉
  function removeUser(userId: string, nickname: string | null) {
    if (!confirm(`確定要刪除用戶「${nickname || '未命名'}」嗎？\n會連同他的額外備註、健康提醒、固定提醒一起刪除，無法復原。`)) return;
    setUsers((prev) => prev.filter((u) => u.userId !== userId));
    fetch(`/api/silver/users?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">銀髮用戶管理</h1>
        <p className="text-sm text-gray-500 mt-1">每位 LINE 用戶的基本資料、額外備註、健康提醒與固定提醒一覽</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中⋯</p>
      ) : users.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">目前還沒有用戶資料</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => {
            const notes = notesByUser[u.userId] ?? [];
            const pendingEvents = healthByUser[u.userId] ?? [];
            const recurring = recurringByUser[u.userId] ?? [];
            return (
              <div
                key={u.userId}
                className="p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-green-300 transition-all space-y-3"
              >
                {editingId === u.userId ? (
                  <div className="space-y-2">
                    <input
                      value={editForm.nickname}
                      onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))}
                      placeholder="暱稱"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                    <div className="flex gap-2">
                      <input
                        value={editForm.age}
                        onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '') }))}
                        placeholder="年齡"
                        inputMode="numeric"
                        className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300"
                      />
                      <select
                        value={editForm.gender}
                        onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}
                        className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-300"
                      >
                        <option value="">性別未填</option>
                        <option value="male">男</option>
                        <option value="female">女</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(u.userId)}
                        className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-gray-900 text-base leading-snug">{u.nickname || '未命名'}</span>
                    <div className="flex gap-1 shrink-0">
                      {u.age != null && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{u.age} 歲</span>
                      )}
                      {u.gender && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{GENDER_LABEL[u.gender] || u.gender}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-400 font-mono truncate" title={u.userId}>{u.userId}</div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-1.5 items-start">
                    <span className="text-gray-400 shrink-0 w-16">額外備註</span>
                    {notes.length ? (
                      <div className="flex flex-wrap gap-1">
                        {notes.map((n) => (
                          <span key={n.id} title={n.createdAt} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full">
                            {NOTE_CATEGORY_LABEL[n.category] || n.category}：{n.content}
                            <button
                              onClick={() => removeNote(u.userId, n.id)}
                              className="text-blue-400 hover:text-blue-700 leading-none"
                              title="刪除"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 items-start">
                    <span className="text-gray-400 shrink-0 w-16">健康提醒</span>
                    {pendingEvents.length ? (
                      <div className="flex flex-wrap gap-1">
                        {pendingEvents.map((e) => (
                          <span key={e.id} className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-100 text-orange-700 rounded-full">
                            {e.description}
                            <button
                              onClick={() => resolveEvent(u.userId, e.id)}
                              className="text-orange-400 hover:text-orange-700 leading-none"
                              title="解除"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 items-start">
                    <span className="text-gray-400 shrink-0 w-16">固定提醒</span>
                    {recurring.length ? (
                      <div className="flex flex-wrap gap-1">
                        {recurring.map((r) => (
                          <span key={r.id} className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-100 text-purple-700 rounded-full">
                            每週{r.daysOfWeek.split(',').map((d) => WEEKDAY_LABEL[Number(d)]).join('、')} {r.description}
                            <button
                              onClick={() => removeRecurring(u.userId, r.id)}
                              className="text-purple-400 hover:text-purple-700 leading-none"
                              title="刪除"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-400">最後更新：{u.updatedAt}</span>
                  {editingId !== u.userId && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(u)}
                        className="text-xs text-gray-500 hover:text-green-600 transition-colors"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => removeUser(u.userId, u.nickname)}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
