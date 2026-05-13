"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LineItem {
  name: string;
  qty: number;
  price: number;
}

interface Client {
  channel_id: string;
  channel_name: string;
  case_start_date: string | null;
  tax_id: string | null;
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

export default function NewInvoicePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [reminderMonth, setReminderMonth] = useState<string>("");
  const [items, setItems] = useState<LineItem[]>([{ name: "", qty: 1, price: 0 }]);
  const [discount, setDiscount] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/finance/clients").then(r => r.json()).then(setClients);
  }, []);

  const selectedClient = clients.find(c => c.channel_id === selectedClientId) ?? null;

  function handleSelectClient(channelId: string) {
    setSelectedClientId(channelId);
    const client = clients.find(c => c.channel_id === channelId);
    if (client?.case_start_date) {
      const start = new Date(client.case_start_date);
      const now = new Date();
      const diff = (now.getFullYear() * 12 + now.getMonth()) -
                   (start.getFullYear() * 12 + start.getMonth());
      setReminderMonth(String(Math.max(1, diff)));
    } else {
      setReminderMonth("");
    }
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", qty: 1, price: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const taxInclusiveAmount = Math.round(subtotal * 1.05) - discount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!selectedClient) { setError("請選擇客戶"); return; }
    if (taxInclusiveAmount <= 0) { setError("含稅金額需大於 0"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClient.channel_id,
          client_name: selectedClient.channel_name,
          tax_id: selectedClient.tax_id ?? '',
          reminder_month: reminderMonth ? parseInt(reminderMonth) : null,
          invoice_items: items.filter((i) => i.name.trim()),
          unit_price: subtotal,
          quantity: 1,
          discount,
          tax_inclusive_amount: taxInclusiveAmount,
          invoice_date: invoiceDate,
          due_date: dueDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "建立失敗");
      }
      router.push("/finance");
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/finance" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">新增發票</h1>
          <p className="text-sm text-gray-500 mt-0.5">選擇客戶並填寫發票資料</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 選擇客戶 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">客戶</h2>
            <Link href="/finance/clients" className="text-xs text-blue-600 hover:text-blue-800">
              管理客戶
            </Link>
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400 mb-2">尚無客戶資料</p>
              <Link href="/finance/clients" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                前往新增客戶
              </Link>
            </div>
          ) : (
            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="">請選擇客戶...</option>
              {clients.map((c) => (
                <option key={c.channel_id} value={c.channel_id}>
                  {c.channel_name}{c.tax_id ? `（${c.tax_id}）` : ''}
                </option>
              ))}
            </select>
          )}

          {selectedClient && (
            <div className="flex gap-4 text-sm bg-gray-50 rounded-lg px-4 py-3">
              <div>
                <span className="text-xs text-gray-400">客戶名稱</span>
                <p className="font-medium text-gray-800">{selectedClient.channel_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">統一編號</span>
                <p className="font-medium text-gray-800">{selectedClient.tax_id || '未填'}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              合約月份{selectedClient?.case_start_date && <span className="ml-1 text-xs font-normal text-gray-400">（開案 {selectedClient.case_start_date}）</span>}
            </label>
            <select
              value={reminderMonth}
              onChange={(e) => setReminderMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="">不指定</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>第 {m} 個月</option>
              ))}
            </select>
          </div>
        </div>

        {/* 發票明細 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">發票明細</h2>

          {/* 欄位標題 */}
          <div className="grid grid-cols-[1fr_72px_100px_80px_32px] gap-2 px-1">
            <span className="text-xs text-gray-400">品項名稱</span>
            <span className="text-xs text-gray-400 text-center">數量</span>
            <span className="text-xs text-gray-400 text-right">單價（未稅）</span>
            <span className="text-xs text-gray-400 text-right">小計</span>
            <span />
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_72px_100px_80px_32px] gap-2 items-center">
                <input
                  type="text"
                  placeholder="例：SEO 顧問服務費"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => updateItem(idx, "qty", parseInt(e.target.value) || 1)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="number"
                  min={0}
                  value={item.price}
                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-sm text-gray-600 text-right tabular-nums">
                  {(item.qty * item.price).toLocaleString()}
                </p>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="flex items-center justify-center text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            新增品項
          </button>

          {/* 金額計算 */}
          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>小計（未稅）</span>
              <span>NT$ {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>優惠折扣</span>
              <div className="flex items-center gap-1">
                <span>－NT$</span>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>加計5%稅後</span>
              <span>NT$ {Math.round(subtotal * 1.05).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2">
              <span>含稅應付金額</span>
              <span>NT$ {taxInclusiveAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 日期 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">日期</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">發票開立日期</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                款項到期日
                <span className="ml-1 text-xs font-normal text-gray-400">（預設10天內）</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/finance"
            className="flex-1 px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 text-center transition-colors"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={submitting || !selectedClient}
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "儲存中..." : "儲存草稿"}
          </button>
        </div>
      </form>
    </div>
  );
}
