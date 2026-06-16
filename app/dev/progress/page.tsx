import { getCurrentTasks, getCompletedTasks } from '@/lib/devDb';
import Link from 'next/link';
import CompletedItem from './CompletedItem';

export const dynamic = 'force-dynamic';

const MEMBERS = ['nana', 'todd', 'steven', 'emma'] as const;
type Member = typeof MEMBERS[number];

const ACCENT: Record<Member, { avatar: string; bar: string; text: string }> = {
  nana:   { avatar: 'bg-[#E8496A]', bar: 'bg-[#E8496A]', text: 'text-[#E8496A]' },
  todd:   { avatar: 'bg-[#2B8CC4]', bar: 'bg-[#2B8CC4]', text: 'text-[#2B8CC4]' },
  steven: { avatar: 'bg-[#7C5CBF]', bar: 'bg-[#7C5CBF]', text: 'text-[#7C5CBF]' },
  emma:   { avatar: 'bg-[#D97706]', bar: 'bg-[#D97706]', text: 'text-[#D97706]' },
};

function parseMonth(param?: string): { year: number; month: number } {
  const now = new Date();
  if (!param || !/^\d{4}-\d{2}$/.test(param)) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const [y, m] = param.split('-').map(Number);
  if (y < 2020 || y > 2035 || m < 1 || m > 12) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: y, month: m };
}

function shiftMonth(year: number, month: number, delta: number): string {
  let m = month + delta, y = year;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export default async function DevProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const monthStr  = `${year}-${String(month).padStart(2, '0')}`;
  const prevHref  = `/dev/progress?month=${shiftMonth(year, month, -1)}`;
  const nextHref  = `/dev/progress?month=${shiftMonth(year, month, 1)}`;

  const current   = getCurrentTasks();
  const completed = getCompletedTasks();
  const today     = new Date().toISOString().slice(0, 10);
  const isThisMonth = monthStr === today.slice(0, 7);

  const monthCompleted = completed.filter(t => t.completed_at.startsWith(monthStr));
  const totalCurrent   = current.length;
  const totalMonthDone = monthCompleted.length;

  return (
    <div className="p-8 max-w-5xl">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-gray-400 uppercase mb-1">Dev Workspace</p>
          <h1 className="text-xl font-bold text-gray-900">個人開發進度</h1>
        </div>

        {/* Month switcher */}
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="px-2.5 py-1 text-xs font-mono text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">←</Link>
          <span className="text-sm font-mono font-semibold text-gray-700 min-w-[6rem] text-center tabular-nums">
            {year} / {String(month).padStart(2, '0')}
          </span>
          <Link href={nextHref} className="px-2.5 py-1 text-xs font-mono text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">→</Link>
          {!isThisMonth && (
            <Link href="/dev/progress" className="px-2.5 py-1 text-xs font-mono text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">本月</Link>
          )}
        </div>
      </div>

      {/* Team KPI strip */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-3xl font-bold text-gray-900 tabular-nums font-mono">{totalCurrent}</p>
          <p className="text-[10px] font-mono tracking-[0.15em] text-gray-400 uppercase mt-1">全隊進行中</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-3xl font-bold text-gray-900 tabular-nums font-mono">{totalMonthDone}</p>
          <p className="text-[10px] font-mono tracking-[0.15em] text-gray-400 uppercase mt-1">
            {year}/{String(month).padStart(2,'0')} 完成
          </p>
        </div>
      </div>

      <div className="h-px bg-gray-100 mb-5" />

      {/* Member cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {MEMBERS.map(member => {
          const accent       = ACCENT[member];
          const myTasks      = current.filter(c => c.person === member);
          const myDone       = monthCompleted.filter(c => c.person === member)
                                .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
          const maxBar       = Math.max(...MEMBERS.map(m => current.filter(c => c.person === m).length), 1);

          return (
            <Link
              key={member}
              href={`/dev/progress/${member}`}
              className="group block bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-50">
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full ${accent.avatar} flex items-center justify-center shrink-0`}>
                    <span className="text-white text-[11px] font-bold uppercase">{member[0]}</span>
                  </div>
                  <span className="text-xs font-black text-gray-800 uppercase tracking-widest">{member}</span>
                </div>
                <div className="flex items-center gap-2">
                  {myTasks.length > 0 && (
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {myTasks.length} 進行中
                    </span>
                  )}
                  <span className="text-xs font-mono text-gray-300 group-hover:text-gray-500 transition-colors">→</span>
                </div>
              </div>

              {/* Completed this month */}
              <div className="px-5 py-4">
                {myDone.length === 0 ? (
                  <p className="text-xs text-gray-300 font-mono py-3 text-center">— 本月尚無完成事項</p>
                ) : (
                  <div className="space-y-2.5">
                    {myDone.slice(0, 5).map(t => (
                      <CompletedItem
                        key={t.id}
                        id={t.id}
                        title={t.title}
                        content={t.content}
                        completedAt={t.completed_at}
                      />
                    ))}
                    {myDone.length > 5 && (
                      <p className="text-[11px] font-mono text-gray-400 pl-[7.75rem]">
                        +{myDone.length - 5} 項…
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer bar */}
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wide">本月完成</span>
                  <span className={`text-sm font-bold font-mono tabular-nums ${myDone.length > 0 ? accent.text : 'text-gray-200'}`}>
                    {myDone.length}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${accent.bar} transition-all duration-500`}
                    style={{ width: totalMonthDone > 0 ? `${(myDone.length / totalMonthDone) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
