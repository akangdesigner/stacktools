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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/silver/users').then((res) => res.json()),
      fetch('/api/silver/notes').then((res) => res.json()),
      fetch('/api/silver/health-events/due').then((res) => res.json()),
    ])
      .then(([usersData, notesData, healthData]) => {
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
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">銀髮用戶管理</h1>
        <p className="text-sm text-gray-500 mt-1">每位 LINE 用戶的基本資料、額外備註與健康提醒一覽</p>
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
            return (
              <div
                key={u.userId}
                className="p-5 rounded-xl border-2 border-gray-200 bg-white hover:border-green-300 transition-all space-y-3"
              >
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

                <div className="text-xs text-gray-400 font-mono truncate" title={u.userId}>{u.userId}</div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-1.5 items-start">
                    <span className="text-gray-400 shrink-0 w-16">額外備註</span>
                    {notes.length ? (
                      <div className="flex flex-wrap gap-1">
                        {notes.map((n) => (
                          <span key={n.id} title={n.createdAt} className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full">
                            {NOTE_CATEGORY_LABEL[n.category] || n.category}：{n.content}
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
                          <span key={e.id} className="px-2 py-0.5 bg-orange-50 border border-orange-100 text-orange-700 rounded-full">
                            {e.description}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">最後更新：{u.updatedAt}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
