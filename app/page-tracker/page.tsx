import Link from 'next/link';
import { listClients, listPageChangeLogs } from '@/lib/gscDb';

export default function PageTrackerHome() {
  const clients = listClients();
  const logs = listPageChangeLogs();

  const countByClient = new Map<number, number>();
  for (const log of logs) {
    countByClient.set(log.client_id, (countByClient.get(log.client_id) ?? 0) + 1);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">網頁改動追蹤</h1>
        <p className="text-sm text-gray-500 mt-0.5">選擇客戶，查看並記錄網頁改動前後的 GSC 成效</p>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">尚未設定 GSC 客戶，請先前往 GSC 排名查詢設定</p>
          <Link href="/gsc" className="mt-4 inline-block text-sm text-blue-500 hover:underline">
            前往設定 →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {clients.map(client => {
              const count = countByClient.get(client.id) ?? 0;
              return (
                <Link
                  key={client.id}
                  href={`/page-tracker/${client.id}`}
                  className="group p-5 rounded-2xl border-2 border-gray-100 bg-white hover:border-sky-300 hover:shadow-md transition-all"
                >
                  <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-lg mb-3">
                    📈
                  </div>
                  <p className="font-semibold text-gray-900 text-sm truncate">{client.name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{client.site_url.replace(/^https?:\/\//, '')}</p>
                  <p className="text-xs text-sky-600 mt-2 font-medium">
                    {count > 0 ? `${count} 筆改動` : '尚無紀錄'}
                  </p>
                </Link>
              );
            })}
          </div>

          <Link
            href="/page-tracker/all"
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors w-fit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            查看所有近期改動
          </Link>
        </>
      )}
    </div>
  );
}
