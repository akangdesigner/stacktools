"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { InvoiceWithItems } from "@/lib/financeDb";

interface LineItem { name: string; qty: number; price: number; }

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "待付款",
  paid: "已付款",
  overdue: "逾期未付",
  voided: "已作廢",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  voided: "bg-gray-100 text-gray-400",
};

function displayStatus(inv: InvoiceWithItems) {
  return inv.invoice_number ? inv.status : "draft";
}

function defaultDueDate() {
  const d = new Date(); d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

export default function FinancePage() {
  const [invoices, setInvoices] = useState<InvoiceWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // 確認收款 modal
  const [payModal, setPayModal] = useState<InvoiceWithItems | null>(null);
  const [payForm, setPayForm] = useState({ paid_date: "", payment_account_last5: "" });
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState("");

  // 編輯 modal
  const [editModal, setEditModal] = useState<InvoiceWithItems | null>(null);
  const [editForm, setEditForm] = useState({ client_name: "", tax_id: "", discount: 0, invoice_date: "", due_date: defaultDueDate() });
  const [editItems, setEditItems] = useState<LineItem[]>([{ name: "", qty: 1, price: 0 }]);
  const [editError, setEditError] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/finance/invoices");
    setInvoices(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // ── 開立電子發票 ───────────────────────────────────────────────────────────
  async function handleIssue(inv: InvoiceWithItems) {
    if (!confirm(`確定要對「${inv.client_name}」開立電子發票？`)) return;
    setLoadingId(inv.id); setError("");
    const res = await fetch(`/api/finance/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue" }),
    });
    setLoadingId(null);
    if (res.ok) { fetchInvoices(); }
    else { const d = await res.json(); setError(d.error || "開立失敗"); }
  }

  // ── 作廢 ──────────────────────────────────────────────────────────────────
  async function handleVoid(inv: InvoiceWithItems) {
    if (!confirm(`確定要作廢發票 ${inv.invoice_number}？此操作無法復原。`)) return;
    setLoadingId(inv.id); setError("");
    const res = await fetch(`/api/finance/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void" }),
    });
    setLoadingId(null);
    if (res.ok) { fetchInvoices(); }
    else { const d = await res.json(); setError(d.error || "作廢失敗"); }
  }

  // ── 刪除草稿 ──────────────────────────────────────────────────────────────
  async function handleDelete(inv: InvoiceWithItems) {
    if (!confirm(`確定要刪除「${inv.client_name}」的草稿？`)) return;
    setLoadingId(inv.id); setError("");
    const res = await fetch(`/api/finance/invoices/${inv.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (res.ok) { fetchInvoices(); }
    else { const d = await res.json(); setError(d.error || "刪除失敗"); }
  }

  // ── 確認收款 ──────────────────────────────────────────────────────────────
  function openPayModal(inv: InvoiceWithItems) {
    setPayModal(inv);
    setPayForm({ paid_date: inv.paid_date ?? new Date().toISOString().slice(0, 10), payment_account_last5: inv.payment_account_last5 ?? "" });
    setPayError("");
  }

  async function handleConfirmPayment() {
    if (!payModal) return;
    if (!payForm.paid_date || !payForm.payment_account_last5) { setPayError("請填寫匯款日期與帳號末5碼"); return; }
    setSaving(true); setPayError("");
    const res = await fetch(`/api/finance/invoices/${payModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_date: payForm.paid_date, payment_account_last5: payForm.payment_account_last5, status: "paid" }),
    });
    setSaving(false);
    if (res.ok) { setPayModal(null); fetchInvoices(); }
    else setPayError("儲存失敗，請再試一次");
  }

  // ── 編輯草稿 ──────────────────────────────────────────────────────────────
  function openEditModal(inv: InvoiceWithItems) {
    setEditModal(inv);
    setEditForm({ client_name: inv.client_name, tax_id: inv.tax_id, discount: inv.discount, invoice_date: inv.invoice_date, due_date: inv.due_date });
    setEditItems(inv.invoice_items.length > 0 ? inv.invoice_items.map(i => ({ ...i })) : [{ name: "", qty: 1, price: 0 }]);
    setEditError("");
  }

  function updateEditItem(idx: number, field: keyof LineItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    if (!/^\d{8}$/.test(editForm.tax_id.trim())) { setEditError("統一編號須為 8 位純數字"); return; }
    const subtotal = editItems.reduce((s, i) => s + i.qty * i.price, 0);
    const tax_inclusive_amount = Math.round(subtotal * 1.05) - editForm.discount;
    if (tax_inclusive_amount <= 0) { setEditError("含稅金額需大於 0"); return; }
    setSaving(true); setEditError("");
    const res = await fetch(`/api/finance/invoices/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: editForm.client_name,
        tax_id: editForm.tax_id,
        invoice_items: editItems.filter(i => i.name.trim()),
        unit_price: subtotal,
        discount: editForm.discount,
        tax_inclusive_amount,
        invoice_date: editForm.invoice_date,
        due_date: editForm.due_date,
      }),
    });
    setSaving(false);
    if (res.ok) { setEditModal(null); fetchInvoices(); }
    else { const d = await res.json(); setEditError(d.error || "儲存失敗"); }
  }

  const pending = invoices.filter(i => i.invoice_number && i.status === "pending");
  const overdue = invoices.filter(i => i.invoice_number && i.status === "overdue");
  const paid = invoices.filter(i => i.status === "paid");
  const editSubtotal = editItems.reduce((s, i) => s + i.qty * i.price, 0);
  const editTotal = Math.round(editSubtotal * 1.05) - editForm.discount;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">財務發票管理</h1>
          <p className="text-sm text-gray-500 mt-1">開立發票、追蹤付款狀態</p>
        </div>
        <Link href="/finance/new" className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新增草稿
        </Link>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">待付款</p>
          <p className="text-2xl font-bold text-yellow-600">{pending.length}</p>
          <p className="text-xs text-gray-400 mt-1">NT$ {pending.reduce((s, i) => s + i.tax_inclusive_amount, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">逾期未付</p>
          <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
          <p className="text-xs text-gray-400 mt-1">NT$ {overdue.reduce((s, i) => s + i.tax_inclusive_amount, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">本月已收款</p>
          <p className="text-2xl font-bold text-green-600">{paid.length}</p>
          <p className="text-xs text-gray-400 mt-1">NT$ {paid.reduce((s, i) => s + i.tax_inclusive_amount, 0).toLocaleString()}</p>
        </div>
      </div>

      {/* 發票列表 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">尚無發票紀錄</p>
          <Link href="/finance/new" className="text-sm text-blue-600 hover:underline">新增第一筆草稿</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">客戶</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">發票號碼</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">含稅金額</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">到期日</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => {
                const ds = displayStatus(inv);
                const busy = loadingId === inv.id;
                return (
                  <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${ds === "voided" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{inv.client_name}</div>
                      <div className="text-xs text-gray-400">{inv.tax_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {inv.invoice_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      NT$ {inv.tax_inclusive_amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {inv.due_date}
                      {inv.paid_date && <div className="text-xs text-green-600">已於 {inv.paid_date} 收款</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[ds]}`}>
                        {STATUS_LABEL[ds]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {ds === "draft" && (
                          <>
                            <button onClick={() => handleIssue(inv)} disabled={busy} className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40">
                              {busy ? "處理中..." : "開立發票"}
                            </button>
                            <button onClick={() => openEditModal(inv)} disabled={busy} className="text-xs text-gray-500 hover:text-gray-700">
                              編輯
                            </button>
                            <button onClick={() => handleDelete(inv)} disabled={busy} className="text-xs text-red-400 hover:text-red-600">
                              刪除
                            </button>
                          </>
                        )}
                        {(ds === "pending" || ds === "overdue") && (
                          <>
                            <button onClick={() => openPayModal(inv)} disabled={busy} className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-40">
                              確認收款
                            </button>
                            <button onClick={() => handleVoid(inv)} disabled={busy} className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40">
                              {busy ? "..." : "作廢"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 確認收款 Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-1">確認收款</h2>
            <p className="text-sm text-gray-500 mb-5">{payModal.client_name}｜NT$ {payModal.tax_inclusive_amount.toLocaleString()}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">實際匯款日</label>
                <input type="date" value={payForm.paid_date} onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">客戶匯款帳號末5碼</label>
                <input type="text" maxLength={5} placeholder="例：12345" value={payForm.payment_account_last5}
                  onChange={e => setPayForm(f => ({ ...f, payment_account_last5: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            {payError && <p className="mt-3 text-sm text-red-600">{payError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPayModal(null)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={handleConfirmPayment} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                {saving ? "儲存中..." : "確認收款"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯草稿 Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <h2 className="text-lg font-bold text-gray-900">編輯草稿</h2>

              {/* 客戶資訊 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">客戶名稱</label>
                  <input type="text" value={editForm.client_name} onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">統一編號</label>
                  <input type="text" maxLength={8} value={editForm.tax_id} onChange={e => setEditForm(f => ({ ...f, tax_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>

              {/* 品項 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">發票明細</label>
                <div className="space-y-2">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input type="text" placeholder="品項名稱" value={item.name} onChange={e => updateEditItem(idx, "name", e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <input type="number" min={1} value={item.qty} onChange={e => updateEditItem(idx, "qty", parseInt(e.target.value) || 1)}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <input type="number" min={0} value={item.price} onChange={e => updateEditItem(idx, "price", parseFloat(e.target.value) || 0)}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <button type="button" onClick={() => setEditItems(p => p.filter((_, i) => i !== idx))} disabled={editItems.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setEditItems(p => [...p, { name: "", qty: 1, price: 0 }])}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">+ 新增品項</button>
                <div className="mt-3 text-sm text-right space-y-1">
                  <div className="text-gray-500">小計 NT$ {editSubtotal.toLocaleString()}</div>
                  <div className="flex items-center justify-end gap-2 text-gray-500">
                    <span>折扣 －NT$</span>
                    <input type="number" min={0} value={editForm.discount} onChange={e => setEditForm(f => ({ ...f, discount: parseFloat(e.target.value) || 0 }))}
                      className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-900" />
                  </div>
                  <div className="font-bold text-gray-900">含稅應付 NT$ {editTotal.toLocaleString()}</div>
                </div>
              </div>

              {/* 日期 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">發票日期</label>
                  <input type="date" value={editForm.invoice_date} onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">到期日</label>
                  <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>

              {editError && <p className="text-sm text-red-600">{editError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={handleSaveEdit} disabled={saving} className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {saving ? "儲存中..." : "儲存變更"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
