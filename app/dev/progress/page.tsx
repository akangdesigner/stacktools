import { getCurrentTasks, getCompletedTasks } from '@/lib/devDb';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const MEMBERS = ['nana', 'todd', 'steven', 'emma'] as const;
type Member = typeof MEMBERS[number];

const ACCENT: Record<Member, string> = {
  nana:   'border-l-rose-400',
  todd:   'border-l-sky-400',
  steven: 'border-l-violet-400',
  emma:   'border-l-amber-400',
};

const DOT: Record<Member, string> = {
  nana:   'bg-rose-400',
  todd:   'bg-sky-400',
  steven: 'bg-violet-400',
  emma:   'bg-amber-400',
};

export default function DevProgressPage() {
  const current = getCurrentTasks();
  const completed = getCompletedTasks();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">個人開發進度</h1>
        <p className="text-sm text-gray-400">點選成員卡片進行任務管理</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MEMBERS.map(member => {
          const myTasks    = current.filter(t => t.person === member);
          const myToday    = completed.filter(t => t.person === member && t.completed_at.startsWith(today));
          const previewMax = 4;

          return (
            <Link
              key={member}
              href={`/dev/progress/${member}`}
              className={`group block bg-white border border-gray-100 border-l-4 ${ACCENT[member]} rounded-xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}
            >
              {/* 人員 header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${DOT[member]}`} />
                  <span className="text-base font-bold text-gray-900 uppercase tracking-wide">{member}</span>
                </div>
                <span className="text-xs text-gray-300 group-hover:text-gray-500 transition-colors">
                  查看管理 →
                </span>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* 進行中 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">進行中</span>
                    <span className="text-xs font-bold text-gray-700 bg-gray-100 rounded-full px-1.5 py-0.5 min-w-5 text-center">
                      {myTasks.length}
                    </span>
                  </div>
                  {myTasks.length === 0 ? (
                    <p className="text-xs text-gray-300 pl-1">無進行中任務</p>
                  ) : (
                    <ul className="space-y-1">
                      {myTasks.slice(0, previewMax).map(t => (
                        <li key={t.id} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                          <div>
                            <p className="text-sm text-gray-800 leading-snug">{t.title}</p>
                            {t.content && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed whitespace-pre-wrap">{t.content}</p>}
                          </div>
                        </li>
                      ))}
                      {myTasks.length > previewMax && (
                        <li className="text-xs text-gray-400 pl-3">+ {myTasks.length - previewMax} 項…</li>
                      )}
                    </ul>
                  )}
                </div>

                {/* 今日完成 */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                  <span className="text-xs text-gray-400">今日完成</span>
                  <span className={`text-xs font-bold ${myToday.length > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {myToday.length} 項
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
