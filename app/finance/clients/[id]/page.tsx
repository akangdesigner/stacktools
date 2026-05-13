"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InvoiceItem { name: string; qty: number; price: number; }

interface Invoice {
  id: string;
  invoice_number: string | null;
  invoice_items: InvoiceItem[];
  tax_inclusive_amount: number;
  invoice_date: string;
  due_date: string;
  status: string;
  paid_date: string | null;
}

interface Client {
  id: string;
  name: string;
  tax_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  invoices: Invoice[];
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:   { label: '草稿',   cls: 'bg-gray-100 text-gray-600' },
  pending: { label: '待收款', cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  overdue: { label: '逾期',   cls: 'bg-red-50 text-red-700 border border-red-200' },
  paid:    { label: '已收款', cls: 'bg-green-50 text-green-700 border border-green-200' },
  voided:  { label: '已作廢', cls: 'bg-gray-100 text-gray-400' },
};

function displayStatus(inv: Invoice) {
  if (!inv.invoice_number) return 'draft';
  return inv.status;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", tax_id: "", contact_name: "", contact_email: "", contact_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/finance/clients/${id}`);
    if (!res.ok) { router.push("/finance/clients"); return; }
    const data: Client = await res.json();
    setClient(data);
    setForm({
      name: data.name,
      tax_id: data.tax_id,
      contact_name: data.contact_name ?? "",
      contact_email: data.contact_email ?? "",
      contact_phone: data.contact_phone ?? "",
      notes: data.notes ?? "",
    });
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "儲存失敗");
      }
      await load();
      setEditing(false);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/clients/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "刪除失敗");
        setDeleting(false);
        setConfirmDelete(false);
        return;
      }
      router.push("/finance/clients");
    } catch {
      alert("刪除失敗");
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">載入中...</div>;
  if (!client) return null;

  const outstanding = client.invoices
    .filter(i => ['pending', 'overdue'].includes(i.status))
    .reduce((s, i) => s + i.tax_inclusive_amount, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance/clients" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">統編 {client.tax_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditing(true); setSaveError(""); }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            編輯
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            刪除客戶
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">聯絡人</p>
          <p className="text-gray-800">{client.contact_name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">電話</p>
          <p className="text-gray-800">{client.contact_phone || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Email</p>
          <p className="text-gray-800 break-all">{client.contact_email || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">未結清金額</p>
          <p className={`font-semibold ${outstanding > 0 ? 'text-amber-700' : 'text-gray-800'}`}>
            {outstanding > 0 ? `NT$ ${outstanding.toLocaleString()}` : '—'}
          </p>
        </div>
        {client.notes && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 mb-0.5">備註</p>
            <p className="text-gray-700 whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Invoice History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">發票紀錄（{client.invoices.length} 張）</h2>
          <Link
            href={`/finance/new`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + 新增發票
          </Link>
        </div>

        {client.invoices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-gray-200">
            尚無發票紀錄
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {client.invoices.map((inv) => {
              const st = displayStatus(inv);
              const badge = STATUS_LABEL[st] ?? STATUS_LABEL.draft;
              return (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">
                      NT$ {inv.tax_inclusive_amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {inv.invoice_date}
                      {inv.invoice_number && <span className="ml-2">{inv.invoice_number}</span>}
                    </p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditing(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">編輯客戶資料</h2>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">客戶名稱 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">統一編號 *</label>
                  <input
                    type="text"
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
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">聯絡電話</label>
                  <input
                    type="text"
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
                  value={form.contact_email}
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {saving ? "儲存中..." : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-2xl mb-3">⚠️</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">確定刪除客戶？</h2>
            <p className="text-sm text-gray-500 mb-5">「{client.name}」的所有聯絡資料將被刪除，但發票紀錄會保留。有未結清發票時無法刪除。</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? "刪除中..." : "確定刪除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
