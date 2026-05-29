"use client";

import { useState, useEffect, useCallback } from "react";
import type { Subscription, SubscriptionCategory, SubscriptionCurrency, SubscriptionCycle, SubscriptionStatus, SubscriptionDepartment } from "@/lib/subscriptionDb";

// ── 常數 ────────────────────────────────────────────────────────────────────

const EXCHANGE: Record<SubscriptionCurrency, number> = { TWD: 1, USD: 32, JPY: 0.22, EUR: 35 };

function toTWD(amount: number, currency: SubscriptionCurrency) {
  return Math.round(amount * EXCHANGE[currency]);
}

function toMonthly(amount: number, cycle: SubscriptionCycle): number {
  if (cycle === 'yearly') return amount / 12;
  if (cycle === 'onetime') return 0;
  return amount;
}

const CATEGORY_LABEL: Record<SubscriptionCategory, string> = {
  ai: 'AI 工具', dev: '開發工具', design: '設計工具', storage: '雲端儲存', other: '其他雜支',
};
const CATEGORY_COLOR: Record<SubscriptionCategory, string> = {
  ai: 'bg-purple-100 text-purple-700',
  dev: 'bg-blue-100 text-blue-700',
  design: 'bg-pink-100 text-pink-700',
  storage: 'bg-teal-100 text-teal-700',
  other: 'bg-gray-100 text-gray-600',
};

const CYCLE_LABEL: Record<SubscriptionCycle, string> = {
  monthly: '月付', yearly: '年付', onetime: '一次性',
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: '有效', paused: '暫停', cancelled: '已取消',
};
const STATUS_COLOR: Record<SubscriptionStatus, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

const CURRENCY_OPTIONS: SubscriptionCurrency[] = ['TWD', 'USD', 'EUR', 'JPY'];
const CYCLE_OPTIONS: SubscriptionCycle[] = ['monthly', 'yearly', 'onetime'];
const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'paused', 'cancelled'];
const CATEGORY_OPTIONS: SubscriptionCategory[] = ['ai', 'dev', 'design', 'storage', 'other'];

const DEPT_LABEL: Record<SubscriptionDepartment, string> = { tech: '技術部', marketing: '行銷部' };
const DEPT_OPTIONS: SubscriptionDepartment[] = ['tech', 'marketing'];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

function BillingBadge({ dateStr }: { dateStr: string | null }) {
  const days = daysUntil(dateStr);
  if (days === null) return <span className="text-gray-300">—</span>;
  if (days < 0) return <span className="text-red-500 font-medium">已逾期</span>;
  if (days === 0) return <span className="text-red-600 font-bold">今天</span>;
  if (days <= 7) return <span className="text-orange-500 font-medium">{days} 天後</span>;
  if (days <= 30) return <span className="text-yellow-600 font-medium">{days} 天後</span>;
  return <span className="text-gray-500">{days} 天後</span>;
}

// ── 共用樣式 & 子元件 ───────────────────────────────────────────────────────

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const selectCls = inputCls;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── 預設表單 ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  category: 'ai' as SubscriptionCategory,
  amount: '',
  currency: 'USD' as SubscriptionCurrency,
  cycle: 'monthly' as SubscriptionCycle,
  next_billing_date: '',
  status: 'active' as SubscriptionStatus,
  note: '',
  account: '',
  password: '',
  payer: '',
  auto_renew: true,
  department: 'tech' as SubscriptionDepartment,
};

// ── 主元件 ──────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<SubscriptionCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<SubscriptionStatus | 'all'>('all');
  const [addDept, setAddDept] = useState<SubscriptionDepartment>('tech');

  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Subscription | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/subscription');
    setSubs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // ── 統計 ────────────────────────────────────────────────────────────────

  const active = subs.filter(s => s.status === 'active');

  const monthlyTWD = active.reduce((acc, s) => {
    return acc + toTWD(toMonthly(s.amount, s.cycle), s.currency);
  }, 0);

  const yearlyTWD = active.reduce((acc, s) => {
    const monthly = toTWD(toMonthly(s.amount, s.cycle), s.currency);
    return acc + monthly * 12;
  }, 0);

  const upcomingCount = active.filter(s => {
    const d = daysUntil(s.next_billing_date);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  // ── Modal 操作 ──────────────────────────────────────────────────────────

  function openAdd(dept: SubscriptionDepartment = 'tech') {
    setForm({ ...EMPTY_FORM, department: dept });
    setAddDept(dept);
    setEditTarget(null);
    setFormError('');
    setModal('add');
  }

  function openEdit(s: Subscription) {
    setForm({
      name: s.name,
      category: s.category,
      amount: String(s.amount),
      currency: s.currency,
      cycle: s.cycle,
      next_billing_date: s.next_billing_date ?? '',
      status: s.status,
      note: s.note ?? '',
      account: s.account ?? '',
      password: s.password ?? '',
      payer: s.payer ?? '',
      auto_renew: s.auto_renew === 1,
      department: s.department ?? 'tech',
    });
    setEditTarget(s);
    setFormError('');
    setModal('edit');
  }

  function closeModal() { setModal(null); setEditTarget(null); setShowPw(false); }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('請輸入服務名稱'); return; }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) { setFormError('請輸入有效費用金額'); return; }

    setSaving(true); setFormError('');
    const body = {
      name: form.name.trim(),
      category: form.category,
      amount: amt,
      currency: form.currency,
      cycle: form.cycle,
      next_billing_date: form.next_billing_date || null,
      status: form.status,
      note: form.note.trim() || null,
      account: form.account.trim() || null,
      password: form.password.trim() || null,
      payer: form.payer.trim() || null,
      auto_renew: form.auto_renew ? 1 : 0,
      department: form.department,
    };

    let res: Response;
    if (modal === 'edit' && editTarget) {
      res = await fetch(`/api/subscription/${editTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      res = await fetch('/api/subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }

    setSaving(false);
    if (res.ok) { closeModal(); fetchSubs(); }
    else { const d = await res.json(); setFormError(d.error || '儲存失敗'); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/subscription/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    fetchSubs();
  }

  async function toggleAutoRenew(s: Subscription) {
    await fetch(`/api/subscription/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_renew: s.auto_renew === 1 ? 0 : 1 }),
    });
    fetchSubs();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const filterFn = (s: Subscription) => {
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  };

  const techSubs = subs.filter(s => s.department === 'tech').filter(filterFn);
  const mktSubs  = subs.filter(s => s.department === 'marketing').filter(filterFn);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* 標題列 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">付費訂閱監控</h1>
            <p className="text-sm text-gray-500 mt-1">追蹤所有 AI 工具與雜支訂閱費用</p>
          </div>
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="本月費用（估）" value={`NT$ ${monthlyTWD.toLocaleString()}`} color="indigo" />
          <StatCard label="本年費用（估）" value={`NT$ ${yearlyTWD.toLocaleString()}`} color="violet" />
          <StatCard label="有效訂閱數" value={`${active.length} 項`} color="teal" />
          <StatCard
            label="7天內續約"
            value={`${upcomingCount} 項`}
            color={upcomingCount > 0 ? 'orange' : 'gray'}
            highlight={upcomingCount > 0}
          />
        </div>

        {/* 篩選 bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as SubscriptionCategory | 'all')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="all">全部類別</option>
            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as SubscriptionStatus | 'all')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="all">全部狀態</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        {/* 部門卡片（上下） */}
        {loading ? (
          <div className="py-16 text-center text-gray-400">載入中…</div>
        ) : (
          <div className="space-y-6">
            {DEPT_OPTIONS.map(dept => {
              const rows = dept === 'tech' ? techSubs : mktSubs;
              const deptActive = subs.filter(s => s.department === dept && s.status === 'active');
              const deptMonthly = deptActive.reduce((acc, s) => acc + toTWD(toMonthly(s.amount, s.cycle), s.currency), 0);
              return (
                <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* 卡片標題 */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-gray-800">{DEPT_LABEL[dept]}</span>
                      <span className="text-xs text-gray-400">{deptActive.length} 項有效・本月 NT${deptMonthly.toLocaleString()}</span>
                    </div>
                    <button onClick={() => openAdd(dept)}
                      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                      + 新增
                    </button>
                  </div>

                  {rows.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">尚無符合的訂閱</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">服務名稱</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">類別</th>
                            <th className="text-right px-4 py-3 font-medium text-gray-500 whitespace-nowrap">費用</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-500 whitespace-nowrap">週期</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">下次續約</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">支付者</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-500 whitespace-nowrap">自動續約</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">狀態</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map(s => {
                            const days = daysUntil(s.next_billing_date);
                            const urgent = s.status === 'active' && days !== null && days >= 0 && days <= 7;
                            return (
                              <tr key={s.id}
                                className={`hover:bg-gray-50 transition-colors ${urgent ? 'bg-orange-50 hover:bg-orange-50' : ''}`}>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{s.name}</div>
                                  {s.account && <div className="text-xs text-gray-400 mt-0.5">{s.account}</div>}
                                  {s.note && <div className="text-xs text-gray-400">{s.note}</div>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[s.category]}`}>
                                    {CATEGORY_LABEL[s.category]}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <div className="font-medium text-gray-900">{s.amount.toLocaleString()} {s.currency}</div>
                                  {s.currency !== 'TWD' && (
                                    <div className="text-xs text-gray-400">≈ NT${toTWD(s.amount, s.currency).toLocaleString()}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">{CYCLE_LABEL[s.cycle]}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="text-xs text-gray-400">{s.next_billing_date ?? '—'}</div>
                                  <BillingBadge dateStr={s.next_billing_date} />
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{s.payer ?? '—'}</td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => toggleAutoRenew(s)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${s.auto_renew === 1 ? 'bg-green-500' : 'bg-gray-300'}`}>
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${s.auto_renew === 1 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                  </button>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                                    {STATUS_LABEL[s.status]}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2 justify-end">
                                    <button onClick={() => openEdit(s)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">編輯</button>
                                    <button onClick={() => setDeleteId(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">刪除</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 匯率說明 */}
        <p className="text-xs text-gray-400 mt-4 text-right">
          參考匯率：1 USD ≈ 32 TWD・1 EUR ≈ 35 TWD・1 JPY ≈ 0.22 TWD（固定估算值）
        </p>
      </div>

      {/* 新增/編輯 Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {modal === 'add' ? '新增訂閱' : '編輯訂閱'}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="服務名稱 *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className={inputCls} placeholder="例：Claude API、Midjourney…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="帳號">
                  <input value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}
                    className={inputCls} placeholder="登入帳號或信箱" />
                </Field>
                <Field label="密碼">
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className={inputCls + ' pr-10'}
                      placeholder="登入密碼" />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                      {showPw ? '隱藏' : '顯示'}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="部門">
                  <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value as SubscriptionDepartment })}
                    className={selectCls}>
                    {DEPT_OPTIONS.map(d => <option key={d} value={d}>{DEPT_LABEL[d]}</option>)}
                  </select>
                </Field>
                <Field label="類別">
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as SubscriptionCategory })}
                    className={selectCls}>
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                </Field>
                <Field label="狀態">
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as SubscriptionStatus })}
                    className={selectCls}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="費用金額 *">
                  <input type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    className={inputCls} placeholder="0" />
                </Field>
                <Field label="幣別">
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as SubscriptionCurrency })}
                    className={selectCls}>
                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="計費週期">
                  <select value={form.cycle} onChange={e => setForm({ ...form, cycle: e.target.value as SubscriptionCycle })}
                    className={selectCls}>
                    {CYCLE_OPTIONS.map(c => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="下次續約日">
                <input type="date" value={form.next_billing_date}
                  onChange={e => setForm({ ...form, next_billing_date: e.target.value })}
                  className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="支付者">
                  <select value={form.payer} onChange={e => setForm({ ...form, payer: e.target.value })}
                    className={selectCls}>
                    <option value="">— 未指定 —</option>
                    <option value="Mike">Mike</option>
                    <option value="Jene">Jene</option>
                    <option value="公司卡">公司卡</option>
                  </select>
                </Field>
                <Field label="自動續約">
                  <div className="flex items-center h-[38px]">
                    <button type="button"
                      onClick={() => setForm({ ...form, auto_renew: !form.auto_renew })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.auto_renew ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.auto_renew ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="ml-2 text-sm text-gray-600">{form.auto_renew ? '是' : '否'}</span>
                  </div>
                </Field>
              </div>
              <Field label="備註">
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  className={inputCls} placeholder="選填說明…" />
              </Field>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={closeModal} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleSave} disabled={saving}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm px-8 py-7">
            <h2 className="text-lg font-bold text-gray-900 mb-2">確認刪除</h2>
            <p className="text-sm text-gray-600 mb-6">
              確定要刪除「{subs.find(s => s.id === deleteId)?.name}」嗎？此操作無法復原。
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleDelete} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 統計卡片子元件 ──────────────────────────────────────────────────────────

const STAT_COLORS = {
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-500',
};

function StatCard({
  label, value, color, highlight
}: {
  label: string; value: string; color: keyof typeof STAT_COLORS; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border-2 px-4 py-4 ${STAT_COLORS[color]} ${highlight ? 'animate-pulse' : ''}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
