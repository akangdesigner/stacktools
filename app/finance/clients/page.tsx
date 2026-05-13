"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ClientWithStats {
  channel_id: string;
  channel_name: string;
  tax_id: string | null;
  contact_name: string | null;
  invoice_count: number;
  outstanding_amount: number;
  last_invoice_date: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/clients");
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/finance" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客戶管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">點入客戶卡片可補填統編與聯絡資料</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">載入中...</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">尚無客戶資料（contracts 資料表為空）</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clients.map((c) => (
            <Link
              key={c.channel_id}
              href={`/finance/clients/${c.channel_id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-gray-700">{c.channel_name}</h3>
                  {c.tax_id ? (
                    <p className="text-xs text-gray-400 mt-0.5">統編 {c.tax_id}</p>
                  ) : (
                    <p className="text-xs text-amber-500 mt-0.5">未填統編</p>
                  )}
                </div>
                {c.outstanding_amount > 0 && (
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                    未收 NT${c.outstanding_amount.toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>發票 {c.invoice_count} 張</span>
                {c.last_invoice_date && (
                  <span>最近 {c.last_invoice_date}</span>
                )}
              </div>

              {c.contact_name && (
                <p className="text-xs text-gray-400 mt-2 truncate">{c.contact_name}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
