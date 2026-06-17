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

const GENDER_LABEL: Record<string, string> = {
  male: '男',
  female: '女',
};

export default function SilverUsersPage() {
  const [users, setUsers] = useState<SilverUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/silver/users')
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">銀髮用戶管理</h1>
        <p className="text-sm text-gray-500 mt-1">已登記暱稱的 LINE 用戶清單</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">載入中⋯</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-400">目前還沒有用戶資料</p>
      ) : (
        <div className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left">
                <th className="px-4 py-3 font-medium">暱稱</th>
                <th className="px-4 py-3 font-medium">年齡</th>
                <th className="px-4 py-3 font-medium">性別</th>
                <th className="px-4 py-3 font-medium">LINE userId</th>
                <th className="px-4 py-3 font-medium">最後更新</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-800 font-medium">{u.nickname || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.age ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{(u.gender && GENDER_LABEL[u.gender]) || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{u.userId}</td>
                  <td className="px-4 py-3 text-gray-400">{u.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
