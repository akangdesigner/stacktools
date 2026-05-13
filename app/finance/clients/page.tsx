"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ClientWithStats {
  id: string;
  name: string;
  tax_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  invoice_count: number;
  outstanding_amount: number;
  last_invoice_date: string | null;
  created_at: string;
}

const emptyForm = { name: "", tax_id: "", contact_name: "", contact_email: "", contact_phone: "", notes: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/finance/clients");
    const data = await res.json();
    setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "建立失敗");
      }
      setShowAdd(false);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">客戶管理</h1>
            <p className="text-sm text-gray-500 mt-0.5">管理客戶基本資料與發票紀錄</p>
          </div>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(""); setForm({ ...emptyForm }); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新增客戶
        </button>
      </div>

      {/* Client Cards */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-12">載入中...</p>
      ) : clients.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-3">尚無客戶資料</p>
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            新增第一位客戶
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/finance/clients/${c.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-gray-700">{c.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">統編 {c.tax_id}</p>
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

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">新增客戶</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">客戶名稱 *</label>
                  <input
                    type="text"
                    placeholder="例：小積木行銷"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">統一編號 *</label>
                  <input
                    type="text"
                    placeholder="12345678"
                    maxLength={8}
                    value={form.tax_id}
                    onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">聯絡人</label>
                  <input
                    type="text"
                    placeholder="姓名"
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">聯絡電話</label>
                  <input
                    type="text"
                    placeholder="0912-345-678"
                    value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="contact@example.com"
                  value={form.contact_email}
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
                <textarea
                  rows={2}
                  placeholder="合約備注、付款條件..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {submitting ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
