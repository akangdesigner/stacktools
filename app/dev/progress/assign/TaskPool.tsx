'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 從客戶進度追蹤撈來的事件（由 server 端組好傳入）
export interface PoolEvent {
  sourceKey: string;        // 客戶名|類型|日期|期數
  channelName: string;
  tag: string;              // 類型標籤文字（SEO 里程碑／網站）
  tagColor: string;         // 標籤配色 class
  label: string;            // 事件說明文字
  date: string;             // 事件日期 YYYY-MM-DD
  assigned: string[];       // 已指派的成員
}

const MEMBERS = ['nana', 'todd', 'steven', 'emma'] as const;

const AVATAR: Record<string, string> = {
  nana:   'bg-[#E8496A]',
  todd:   'bg-[#2B8CC4]',
  steven: 'bg-[#7C5CBF]',
  emma:   'bg-[#D97706]',
};

export default function TaskPool({ events }: { events: PoolEvent[] }) {
  const router = useRouter();
  // 每個事件勾選中的成員：sourceKey -> 勾選中的成員清單
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  function toggle(key: string, person: string) {
    setPicked(prev => {
      const cur = prev[key] ?? [];
      return { ...prev, [key]: cur.includes(person) ? cur.filter(p => p !== person) : [...cur, person] };
    });
  }

  async function handleAssign(e: PoolEvent) {
    const persons = picked[e.sourceKey] ?? [];
    if (persons.length === 0) return;
    setSubmitting(e.sourceKey);
    await fetch('/api/dev/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persons,
        title: `${e.channelName}｜${e.tag}`,
        content: e.label,
        due_date: e.date,
        source_key: e.sourceKey,
      }),
    });
    setPicked(prev => ({ ...prev, [e.sourceKey]: [] }));
    setSubmitting(null);
    router.refresh();  // 重新抓 server 資料，讓甘特圖與指派狀態更新
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
      <div className="px-5 py-3">
          {events.length === 0 ? (
            <p className="text-xs text-gray-300 font-mono py-3 text-center">— 本月沒有客戶任務</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {events.map(e => {
                const sel = picked[e.sourceKey] ?? [];
                const isDone = e.assigned.length > 0;
                return (
                  <div key={e.sourceKey} className="flex items-center gap-3 py-2.5">
                    {/* 事件資訊 */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${e.tagColor}`}>{e.tag}</span>
                    <span className="text-[11px] font-mono text-gray-400 tabular-nums shrink-0">{e.date.slice(5)}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${isDone ? 'text-gray-400' : 'text-gray-800'}`}>{e.channelName}</span>
                      {e.label && <span className="text-xs text-gray-400 ml-2 truncate">{e.label}</span>}
                    </div>

                    {/* 已指派成員 */}
                    {e.assigned.map(p => (
                      <span
                        key={p}
                        className={`w-5 h-5 rounded-full ${AVATAR[p] ?? 'bg-gray-400'} flex items-center justify-center shrink-0`}
                        title={`已指派：${p}`}
                      >
                        <span className="text-white text-[9px] font-bold uppercase">{p[0]}</span>
                      </span>
                    ))}

                    {/* 勾選成員（已指派的不重複列） */}
                    <div className="flex items-center gap-1 shrink-0">
                      {MEMBERS.filter(m => !e.assigned.includes(m)).map(m => {
                        const on = sel.includes(m);
                        return (
                          <button
                            key={m}
                            onClick={() => toggle(e.sourceKey, m)}
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                              on ? `${AVATAR[m]} border-transparent` : 'bg-white border-gray-200 hover:border-gray-400'
                            }`}
                            title={on ? `取消勾選 ${m}` : `勾選 ${m}`}
                          >
                            <span className={`text-[9px] font-bold uppercase ${on ? 'text-white' : 'text-gray-300'}`}>{m[0]}</span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => handleAssign(e)}
                      disabled={sel.length === 0 || submitting === e.sourceKey}
                      className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-20 transition-colors shrink-0"
                    >
                      {submitting === e.sourceKey ? '…' : '指派'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] font-mono text-gray-300 pt-2">
            指派後任務會出現在該成員的開發日程（預計完成日＝事件日期）；取消指派請到成員個人頁刪除該任務。
          </p>
        </div>
    </div>
  );
}
