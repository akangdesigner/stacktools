'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

type GscClient = { id: number; name: string; site_url: string };

type ChangeLog = {
  id: number;
  client_id: number;
  client_name: string;
  site_url: string;
  page_url: string;
  change_date: string;
  gsc_date: string | null;
  title: string | null;
  description: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  avg_position: number | null;
};

type Snapshot = {
  id: number;
  log_id: number;
  snapshot_date: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  avg_position: number | null;
};

type Metrics = { clicks: number | null; impressions: number | null; ctr: number | null; avg_position: number | null };

const today = new Date().toISOString().split('T')[0];
const defaultGscDate = (() => {
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - 3);
  return d.toISOString().split('T')[0];
})();

function fmtN(v: number | null, fn: (n: number) => string, fallback = '—') {
  return v != null ? fn(v) : fallback;
}

// 排名：數字下降 = 進步 = invert；其他：數字上升 = 進步
function diffColor(d: number, invert: boolean) {
  if (d === 0) return 'text-gray-400';
  return (invert ? d < 0 : d > 0) ? 'text-red-500' : 'text-emerald-600';
}

function DeltaBadge({ curr, prev, invert = false }: { curr: number | null; prev: number | null; invert?: boolean }) {
  if (curr == null || prev == null) return null;
  const d = Math.round((curr - prev) * 10) / 10;
  if (d === 0) return null;
  return (
    <span className={`text-xs font-semibold ml-1 ${diffColor(d, invert)}`}>
      {d > 0 ? '+' : ''}{d}
    </span>
  );
}

// 大圖比較：基準 vs 最後一筆快照
function BigComparison({ base, last, baseDateLabel, lastDateLabel }: {
  base: Metrics; last: Metrics; baseDateLabel: string; lastDateLabel: string;
}) {
  const metrics: { label: string; key: keyof Metrics; format: (v: number) => string; invert: boolean }[] = [
    { label: '點擊', key: 'clicks', format: v => v.toLocaleString(), invert: false },
    { label: '曝光', key: 'impressions', format: v => v.toLocaleString(), invert: false },
    { label: 'CTR', key: 'ctr', format: v => `${v}%`, invert: false },
    { label: '排名', key: 'avg_position', format: v => v.toFixed(1), invert: true },
  ];

  return (
    <div className="mx-4 mb-4 rounded-2xl bg-gradient-to-br from-slate-50 to-sky-50 border border-sky-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">改動前後比較</p>
        <p className="text-xs text-gray-400">{baseDateLabel} → {lastDateLabel}</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {metrics.map(({ label, key, format, invert }) => {
          const bv = base[key] as number | null;
          const cv = last[key] as number | null;
          const d = bv != null && cv != null ? Math.round((cv - bv) * 10) / 10 : null;
          const color = d != null ? diffColor(d, invert) : 'text-gray-500';
          return (
            <div key={label} className="text-center">
              <p className="text-xs text-gray-400 mb-2">{label}</p>
              <p className="text-xs text-gray-400 tabular-nums">{fmtN(bv, format)}</p>
              <p className="text-gray-300 text-xs my-0.5">↓</p>
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{fmtN(cv, format)}</p>
              {d != null && d !== 0 && (
                <p className={`text-xs font-semibold mt-1 tabular-nums ${color}`}>
                  {d > 0 ? '+' : ''}{d}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ClientPageTracker() {
  const params = useParams();
  const router = useRouter();
  const clientId = Number(params.id);

  const [client, setClient] = useState<GscClient | null>(null);
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [snapshots, setSnapshots] = useState<Map<number, Snapshot[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', page_url: '', change_date: today, gsc_date: defaultGscDate, description: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes, sRes] = await Promise.all([
        fetch('/api/gsc/clients'),
        fetch('/api/page-tracker'),
        fetch('/api/page-tracker/snapshot'),
      ]);
      const [clients, allLogs, allSnaps]: [GscClient[], ChangeLog[], Snapshot[]] = await Promise.all([
        cRes.json(), lRes.json(), sRes.json(),
      ]);
      setClient(clients.find(c => c.id === clientId) ?? null);
      setLogs((allLogs ?? []).filter(l => l.client_id === clientId));
      const map = new Map<number, Snapshot[]>();
      for (const s of (allSnaps ?? [])) {
        const list = map.get(s.log_id) ?? [];
        list.push(s);
        map.set(s.log_id, list);
      }
      setSnapshots(map);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/page-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          title: form.title || null,
          page_url: form.page_url,
          change_date: form.change_date,
          gsc_date: form.gsc_date,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      setLogs(prev => [data, ...prev]);
      setForm({ title: '', page_url: '', change_date: today, gsc_date: defaultGscDate, description: '' });
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSnapshot(logId: number) {
    setSnapshotLoading(prev => new Set(prev).add(logId));
    try {
      const res = await fetch('/api/page-tracker/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setSnapshots(prev => {
        const next = new Map(prev);
        next.set(logId, [...(next.get(logId) ?? []), data]);
        return next;
      });
    } finally {
      setSnapshotLoading(prev => { const s = new Set(prev); s.delete(logId); return s; });
    }
  }

  async function handleDeleteLog(id: number) {
    if (!confirm('確認刪除此改動紀錄及所有快照？')) return;
    await fetch('/api/page-tracker', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setLogs(prev => prev.filter(l => l.id !== id));
    setSnapshots(prev => { const next = new Map(prev); next.delete(id); return next; });
  }

  async function handleDeleteSnap(snapId: number, logId: number) {
    await fetch('/api/page-tracker/snapshot', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: snapId }),
    });
    setSnapshots(prev => {
      const next = new Map(prev);
      next.set(logId, (next.get(logId) ?? []).filter(s => s.id !== snapId));
      return next;
    });
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">載入中…</div>;
  if (!client) return (
    <div className="p-8 text-sm text-gray-500">
      找不到此客戶。
      <button onClick={() => router.back()} className="ml-2 text-blue-500 hover:underline">返回</button>
    </div>
  );

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
      </div>
      <p className="text-xs text-gray-400 ml-7 mb-7">{client.site_url}</p>

      {/* 新增按鈕 / 表單 */}
      <div className="mb-6">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> 新增改動紀錄
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700">新增改動紀錄</p>

            <div>
              <label className="block text-xs text-gray-500 mb-1">標題（選填）</label>
              <input
                type="text"
                placeholder="例：客戶產品頁名稱、文章標題"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">改動日期</label>
                <input type="date" value={form.change_date}
                  onChange={e => setForm(f => ({ ...f, change_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">GSC 抓取日期</label>
                <input type="date" value={form.gsc_date}
                  onChange={e => setForm(f => ({ ...f, gsc_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" required />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">頁面 URL</label>
              <input type="url" placeholder="https://example.com/blog/page" value={form.page_url}
                onChange={e => setForm(f => ({ ...f, page_url: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" required />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">改動描述</label>
              <textarea placeholder="例：修改 H1、新增 FAQ 段落、更新 meta description…" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none" required />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={submitting}
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                {submitting ? '取得 GSC 中…' : '儲存'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">取消</button>
            </div>
          </form>
        )}
      </div>

      {/* 改動卡片 */}
      {logs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">尚無改動紀錄</p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map(log => {
            const snaps = snapshots.get(log.id) ?? [];
            const lastSnap = snaps[snaps.length - 1] ?? null;
            const isSnapping = snapshotLoading.has(log.id);
            const pagePath = log.page_url.replace(/^https?:\/\/[^/]+/, '') || '/';

            return (
              <div key={log.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* 卡片主體 */}
                <div className="px-5 pt-5 pb-4">

                  {/* 標題 + URL */}
                  {log.title ? (
                    <>
                      <a
                        href={log.page_url} target="_blank" rel="noopener noreferrer"
                        className="group flex items-start gap-1.5 mb-1 hover:opacity-80 transition-opacity"
                      >
                        <span className="text-base font-semibold text-gray-900 leading-snug">{log.title}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400 group-hover:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <p className="text-xs text-gray-400 font-mono mb-3 truncate">{pagePath}</p>
                    </>
                  ) : (
                    <a
                      href={log.page_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-blue-600 font-mono hover:underline mb-3 truncate"
                      title={log.page_url}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      {pagePath}
                    </a>
                  )}

                  {/* 描述 */}
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">{log.description}</p>

                  {/* 日期 */}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                    <span>改動 <span className="text-gray-600 font-medium">{log.change_date}</span></span>
                    {log.gsc_date && log.gsc_date !== log.change_date && (
                      <>
                        <span className="opacity-30">·</span>
                        <span>GSC <span className="text-gray-600 font-medium">{log.gsc_date}</span></span>
                      </>
                    )}
                  </div>

                  {/* 基準 metrics */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '點擊', v: log.clicks, fmt: (n: number) => n.toLocaleString() },
                      { label: '曝光', v: log.impressions, fmt: (n: number) => n.toLocaleString() },
                      { label: 'CTR', v: log.ctr, fmt: (n: number) => `${n}%` },
                      { label: '排名', v: log.avg_position, fmt: (n: number) => n.toFixed(1) },
                    ].map(({ label, v, fmt }) => (
                      <div key={label} className="flex flex-col items-center bg-gray-50 rounded-xl px-2 py-2.5">
                        <span className="text-xs text-gray-400 mb-1">{label}</span>
                        <span className="text-sm font-semibold text-gray-700 tabular-nums">
                          {v != null ? fmt(v) : <span className="text-gray-300 font-normal">—</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 大圖比較（有快照才顯示） */}
                {lastSnap && (
                  <BigComparison
                    base={log}
                    last={lastSnap}
                    baseDateLabel={log.gsc_date ?? log.change_date}
                    lastDateLabel={lastSnap.snapshot_date}
                  />
                )}

                {/* 快照明細 */}
                {snaps.length > 0 && (
                  <div className="border-t border-gray-50 px-5 py-3 space-y-1.5">
                    <p className="text-xs text-gray-400 font-medium mb-2">快照紀錄</p>
                    {snaps.map((snap, i) => {
                      const prev: Metrics = i === 0 ? log : snaps[i - 1];
                      return (
                        <div key={snap.id} className="flex items-center gap-2 bg-sky-50/60 rounded-xl px-3 py-2">
                          <span className="text-xs text-sky-600 font-medium whitespace-nowrap w-20 shrink-0">{snap.snapshot_date}</span>
                          <div className="grid grid-cols-4 gap-1 flex-1 text-xs text-center tabular-nums">
                            {[
                              { v: snap.clicks, bv: prev.clicks, fn: (n: number) => n.toLocaleString(), inv: false },
                              { v: snap.impressions, bv: prev.impressions, fn: (n: number) => n.toLocaleString(), inv: false },
                              { v: snap.ctr, bv: prev.ctr, fn: (n: number) => `${n}%`, inv: false },
                              { v: snap.avg_position, bv: prev.avg_position, fn: (n: number) => n.toFixed(1), inv: true },
                            ].map((m, idx) => (
                              <div key={idx}>
                                <span className="text-gray-700">{fmtN(m.v, m.fn)}</span>
                                <DeltaBadge curr={m.v} prev={m.bv} invert={m.inv} />
                              </div>
                            ))}
                          </div>
                          <button onClick={() => handleDeleteSnap(snap.id, log.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors text-xs shrink-0">✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 卡片底部 */}
                <div className="border-t border-gray-50 px-5 py-3 flex items-center justify-between">
                  <button onClick={() => handleSnapshot(log.id)} disabled={isSnapping}
                    className="text-sm text-sky-600 hover:text-sky-800 font-medium transition-colors disabled:opacity-40">
                    {isSnapping ? '取得 GSC 中…' : '+ 記錄快照'}
                  </button>
                  <button onClick={() => handleDeleteLog(log.id)}
                    className="text-xs text-gray-300 hover:text-red-400 transition-colors">刪除改動</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
