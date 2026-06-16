import Link from 'next/link';
import SearchInput from './SearchInput';
import OwnerFilter from './OwnerFilter';
import OwnerBadge from './OwnerBadge';

const WEBHOOK_URL = 'https://n8n.dg166.com/webhook/monthly-plan';

type EventType = 'seo' | 'seo_bill' | 'monthly' | 'web';

type PlanEvent = {
  channel_name: string;
  type: EventType;
  date: string;
  period: string | null;
  contract_start: string;
  contract_end: string;
  label: string;
};


const SEO_OWNERS: Record<string, string[]> = {
  '1':['Amy','Selina'],'7':['Amy','Selina'],'14':['Amy','Selina'],
  '21':['Amy','Selina'],'28':['Amy','Selina'],'30':['Emma'],
  '35':['Amy','Selina'],'42':['Amy','Selina'],'49':['Amy','Selina'],
  '56':['Amy','Selina'],'60':['Emma'],'63':['Amy','Selina'],'70':['Emma'],
};

function getOwners(type: EventType, period: string | null): string[] {
  if (type === 'seo') return SEO_OWNERS[period ?? ''] ?? [];
  if (type === 'seo_bill') return period === '13' ? ['Mike'] : period === '6' ? ['Mike','Selina','Steven'] : ['Mike','Selina','Steven','Jena'];
  if (type === 'monthly') return period === '13' ? ['Mike'] : ['Mike','Selina','Steven','Jena'];
  if (type === 'web') return ['Mike'];
  return [];
}

const BASE_TYPE_CONFIG: Record<EventType, { tag: string; tagColor: string }> = {
  seo:      { tag: 'SEO 里程碑', tagColor: 'bg-teal-100 text-teal-700 border-teal-200' },
  seo_bill: { tag: 'SEO 請款',   tagColor: 'bg-blue-100 text-blue-700 border-blue-200' },
  monthly:  { tag: '月費請款',   tagColor: 'bg-orange-100 text-orange-700 border-orange-200' },
  web:      { tag: '網站',       tagColor: 'bg-green-100 text-green-700 border-green-200' },
};

function getTypeConfig(type: EventType, period: string | null) {
  if ((type === 'seo_bill' || type === 'monthly') && period === '13') {
    return { tag: type === 'seo_bill' ? 'SEO 續約' : '月費續約', tagColor: 'bg-red-100 text-red-700 border-red-200' };
  }
  return BASE_TYPE_CONFIG[type] ?? { tag: type, tagColor: 'bg-gray-100 text-gray-700 border-gray-200' };
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

async function fetchData(): Promise<PlanEvent[]> {
  try {
    const res = await fetch(WEBHOOK_URL, { next: { revalidate: 300 } });
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
  let m = month + delta;
  let y = year;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export default async function MonthlyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; search?: string; owner?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const search = (params.search ?? '').trim().toLowerCase();
  const ownerFilter = params.owner ?? '';

  const pad = (n: number) => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month)}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${pad(month)}-${pad(lastDay)}`;

  const allData = await fetchData();
  const clients = [...new Set(allData.map(e => e.channel_name))].sort();
  const filtered = allData.filter(e =>
    e.date && e.date >= startDate && e.date <= endDate &&
    (!search || e.channel_name === params.search) &&
    (!ownerFilter || getOwners(e.type, e.period).includes(ownerFilter))
  );

  const grouped = new Map<string, PlanEvent[]>();
  for (const e of filtered) {
    const list = grouped.get(e.date) ?? [];
    list.push(e);
    grouped.set(e.date, list);
  }
  const sortedDates = [...grouped.keys()].sort();

  const todayStr  = new Date().toISOString().split('T')[0];

  function buildHref(overrides: Record<string, string>, hash?: string) {
    const p = new URLSearchParams();
    if (params.search) p.set('search', params.search);
    if (ownerFilter)   p.set('owner', ownerFilter);
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v));
    return `/monthly-plan?${p.toString()}${hash ? hash : ''}`;
  }

  const prevHref  = buildHref({ month: shiftMonth(year, month, -1) });
  const nextHref  = buildHref({ month: shiftMonth(year, month, 1) });
  const todayHref = buildHref({}, '#today');

  const billCount      = filtered.filter(e => (e.type === 'seo_bill' || e.type === 'monthly') && e.period !== '13').length;
  const renewCount     = filtered.filter(e => ((e.type === 'seo_bill' || e.type === 'monthly') && e.period === '13') || e.type === 'web').length;
  const milestoneCount = filtered.filter(e => e.type === 'seo').length;

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">客戶進度追蹤</h1>
            <p className="text-sm text-gray-500 mt-0.5">合約里程碑、請款與續約提醒</p>
          </div>
          <div className="flex items-center gap-2 flex-nowrap">
            <SearchInput clients={clients} value={params.search ?? ''} />
            <Link href={todayHref} className="px-3 py-1.5 rounded-lg border border-blue-200 text-sm text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0">
              跳至今天
            </Link>
            <Link href={prevHref} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors shrink-0">
              ← 上月
            </Link>
            <span className="text-sm font-semibold text-gray-900 min-w-24 text-center shrink-0">
              {year} 年 {month} 月
            </span>
            <Link href={nextHref} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors shrink-0">
              下月 →
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 shrink-0">負責人篩選</span>
          <OwnerFilter value={ownerFilter} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
          <p className="text-2xl font-bold text-orange-700">{billCount}</p>
          <p className="text-xs text-orange-600 mt-0.5">請款提醒</p>
        </div>
        <div className="p-4 rounded-xl bg-red-50 border border-red-100">
          <p className="text-2xl font-bold text-red-700">{renewCount}</p>
          <p className="text-xs text-red-600 mt-0.5">續約提醒</p>
        </div>
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-100">
          <p className="text-2xl font-bold text-teal-700">{milestoneCount}</p>
          <p className="text-xs text-teal-600 mt-0.5">SEO 里程碑</p>
        </div>
      </div>

      {/* Timeline */}
      {sortedDates.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">本月無排程事項</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sortedDates.map(date => {
            const d       = new Date(date + 'T12:00:00');
            const isToday = date === todayStr;
            const isPast  = date < todayStr;
            const events  = grouped.get(date) ?? [];

            return (
              <div key={date} id={isToday ? 'today' : undefined}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-semibold ${isToday ? 'text-blue-600' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
                    {month} / {d.getDate()}（週{WEEKDAYS[d.getDay()]}）
                  </span>
                  {isToday && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">今天</span>
                  )}
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <div className="space-y-2 pl-1">
                  {events.map((e, i) => {
                    const tc = getTypeConfig(e.type, e.period);
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                          isPast
                            ? 'bg-gray-50 border-gray-100 opacity-55'
                            : 'bg-white border-gray-100 shadow-sm'
                        }`}
                      >
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${tc.tagColor}`}>
                          {tc.tag}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{e.channel_name}</p>
                            <OwnerBadge owners={getOwners(e.type, e.period)} activeOwner={ownerFilter} />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{e.label}</p>
                        </div>
                        <p className="text-xs text-gray-400 shrink-0 pt-0.5">到期 {e.contract_end}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
