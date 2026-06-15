export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { listPageChangeLogs, listClients, listAllSnapshots } from '@/lib/gscDb';

export default function AllChangesPage() {
  const logs = listPageChangeLogs();
  const clients = listClients();
  const snaps = listAllSnapshots();

  const clientMap = new Map(clients.map(c => [c.id, c]));
  const snapCountByLog = new Map<number, number>();
  for (const s of snaps) {
    snapCountByLog.set(s.log_id, (snapCountByLog.get(s.log_id) ?? 0) + 1);
  }

  // 依日期分組
  const grouped = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = grouped.get(log.change_date) ?? [];
    list.push(log);
    grouped.set(log.change_date, list);
  }
  const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/page-tracker" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">所有近期改動</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {logs.length > 0 ? `共 ${logs.length} 筆，所有客戶` : '尚無紀錄'}
          </p>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">尚無改動紀錄</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(date => {
            const dayLogs = grouped.get(date) ?? [];
            return (
              <div key={date}>
                {/* 日期標題 */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-semibold text-gray-700">{date}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <div className="space-y-2">
                  {dayLogs.map(log => {
                    const client = clientMap.get(log.client_id);
                    const snapCount = snapCountByLog.get(log.id) ?? 0;
                    const pagePath = log.page_url.replace(/^https?:\/\/[^/]+/, '') || '/';

                    return (
                      <Link
                        key={log.id}
                        href={`/page-tracker/${log.client_id}`}
                        className="flex items-start gap-4 bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:border-gray-300 hover:shadow-sm transition-all"
                      >
                        {/* 客戶名 */}
                        <div className="shrink-0 w-16 pt-0.5">
                          <p className="text-xs font-medium text-gray-500 truncate">{client?.name ?? '—'}</p>
                        </div>

                        {/* 內容 */}
                        <div className="flex-1 min-w-0">
                          {log.title && (
                            <p className="text-sm font-semibold text-gray-900 truncate mb-0.5">{log.title}</p>
                          )}
                          <p className="text-xs text-blue-500 font-mono truncate">{pagePath}</p>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1 leading-relaxed">{log.description}</p>
                        </div>

                        {/* 右側 */}
                        <div className="shrink-0 text-right">
                          {log.gsc_date && log.gsc_date !== log.change_date && (
                            <p className="text-xs text-gray-400">GSC {log.gsc_date}</p>
                          )}
                          {snapCount > 0 && (
                            <p className="text-xs text-sky-500 mt-1">{snapCount} 筆快照</p>
                          )}
                        </div>
                      </Link>
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
