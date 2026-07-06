import { getCurrentTasks, getCompletedTasks } from '@/lib/devDb';
import Link from 'next/link';
import TaskPool, { PoolEvent } from './TaskPool';

export const dynamic = 'force-dynamic';

// 客戶進度追蹤的資料來源（同 /monthly-plan 頁面）
const PLAN_WEBHOOK_URL = 'https://n8n.dg166.com/webhook/monthly-plan';

interface PlanEvent {
  channel_name: string;
  type: string;          // seo | seo_bill | monthly | web
  date: string;
  period: string | null;
  label: string;
}

// 只撈技術部相關的事件類型
const POOL_TYPES: Record<string, { tag: string; tagColor: string }> = {
  seo: { tag: 'SEO 里程碑', tagColor: 'bg-teal-100 text-teal-700 border-teal-200' },
  web: { tag: '網站',       tagColor: 'bg-green-100 text-green-700 border-green-200' },
};

async function fetchPlanEvents(): Promise<PlanEvent[]> {
  try {
    const res = await fetch(PLAN_WEBHOOK_URL, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

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

export default async function DevAssignPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const monthStr  = `${year}-${String(month).padStart(2, '0')}`;
  const prevHref  = `/dev/progress/assign?month=${shiftMonth(year, month, -1)}`;
  const nextHref  = `/dev/progress/assign?month=${shiftMonth(year, month, 1)}`;
  const isThisMonth = monthStr === new Date().toISOString().slice(0, 7);

  // 比對 source_key 算出每個事件已指派給誰（含已完成的，避免完成後變回未分配）
  const assignedBySource = new Map<string, string[]>();
  for (const t of [...getCurrentTasks(), ...getCompletedTasks()]) {
    if (!t.source_key) continue;
    const list = assignedBySource.get(t.source_key) ?? [];
    if (!list.includes(t.person)) list.push(t.person);
    assignedBySource.set(t.source_key, list);
  }

  const planEvents = await fetchPlanEvents();
  const poolEvents: PoolEvent[] = planEvents
    .filter(e => POOL_TYPES[e.type] && e.date?.startsWith(monthStr))
    .map(e => {
      const sourceKey = `${e.channel_name}|${e.type}|${e.date}|${e.period ?? ''}`;
      return {
        sourceKey,
        channelName: e.channel_name,
        tag: POOL_TYPES[e.type].tag,
        tagColor: POOL_TYPES[e.type].tagColor,
        label: e.label ?? '',
        date: e.date,
        assigned: assignedBySource.get(sourceKey) ?? [],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const unassignedCount = poolEvents.filter(e => e.assigned.length === 0).length;

  return (
    <div className="p-8 max-w-4xl">

      {/* 返回開發日程安排 */}
      <Link
        href="/dev/progress"
        className="inline-block text-[10px] font-mono tracking-[0.15em] text-gray-400 hover:text-gray-600 transition-colors mb-6 uppercase"
      >
        ← 開發日程安排
      </Link>

      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-gray-400 uppercase mb-1">Dev Workspace</p>
          <h1 className="text-xl font-bold text-gray-900">任務分配</h1>
          <p className="text-xs text-gray-400 mt-1">
            任務來自「客戶進度追蹤」的 SEO 里程碑與網站事件，勾選成員（可多人）後指派
          </p>
        </div>

        {/* 月份切換 */}
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="px-2.5 py-1 text-xs font-mono text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">←</Link>
          <span className="text-sm font-mono font-semibold text-gray-700 min-w-[6rem] text-center tabular-nums">
            {year} / {String(month).padStart(2, '0')}
          </span>
          <Link href={nextHref} className="px-2.5 py-1 text-xs font-mono text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">→</Link>
          {!isThisMonth && (
            <Link href="/dev/progress/assign" className="px-2.5 py-1 text-xs font-mono text-blue-500 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">本月</Link>
          )}
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-3xl font-bold text-amber-500 tabular-nums font-mono">{unassignedCount}</p>
          <p className="text-[10px] font-mono tracking-[0.15em] text-gray-400 uppercase mt-1">未分配</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <p className="text-3xl font-bold text-gray-900 tabular-nums font-mono">{poolEvents.length - unassignedCount}</p>
          <p className="text-[10px] font-mono tracking-[0.15em] text-gray-400 uppercase mt-1">已分配</p>
        </div>
      </div>

      <TaskPool events={poolEvents} />
    </div>
  );
}
