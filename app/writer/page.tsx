'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

type SheetData = { headers: string[]; rows: string[][]; tabName?: string; rowOffset?: number; sheetId?: string };
type Tab = 'schedule' | 'progress' | 'personal';

type WriterClient = {
  id: number;
  name: string;
  article_sheet_id: string;
  article_sheet_tab: string;
};

type WriterSettings = {
  schedule_sheet_id: string;
  schedule_sheet_tab: string;
  clients_sheet_id: string;
  clients_sheet_tab: string;
  progress_tracking_sheet_id: string;
  openrouter_model: string;
};

const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: '每日排程' },
  { key: 'progress', label: '進度登記' },
  { key: 'personal', label: '個人進度' },
];

// ── 欄位字母轉換 ─────────────────────────────────────────────────────

function colLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// ── 週次解析工具 ──────────────────────────────────────────────────────

function getWeekBounds(date: Date): { mon: Date; sun: Date } {
  const d = date.getDay();
  const offset = d === 0 ? -6 : 1 - d;
  const mon = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { mon, sun };
}

type IndexedRow = { row: string[]; idx: number };

function parseWeekGroups(rows: string[][]): IndexedRow[][] {
  const groups: IndexedRow[][] = [];
  let current: IndexedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(cell => !cell?.trim())) {
      if (current.length > 0) { groups.push(current); current = []; }
    } else {
      current.push({ row, idx: i });
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function groupDate(group: IndexedRow[], monthIdx: number, dayIdx: number): Date | null {
  const year = new Date().getFullYear();
  for (const { row } of group) {
    const m = parseInt(row[monthIdx] ?? '');
    const d = parseInt(row[dayIdx] ?? '');
    if (m > 0 && d > 0) return new Date(year, m - 1, d);
  }
  return null;
}

function findWeekGroups(groups: IndexedRow[][], monthIdx: number, dayIdx: number) {
  const today = new Date();
  const { mon, sun } = getWeekBounds(today);
  const nextMon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
  const nextSun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7);
  for (let i = 0; i < groups.length; i++) {
    const d = groupDate(groups[i], monthIdx, dayIdx);
    if (d && d >= mon && d <= sun) {
      return { thisIdx: i, nextIdx: i + 1 < groups.length ? i + 1 : -1, mon, sun, nextMon, nextSun };
    }
  }
  const weekOfMonth = Math.ceil(today.getDate() / 7) - 1;
  const thisIdx = Math.min(weekOfMonth, groups.length - 1);
  return { thisIdx, nextIdx: thisIdx + 1 < groups.length ? thisIdx + 1 : -1, mon, sun, nextMon, nextSun };
}

function fmtDate(d: Date) { return `${d.getMonth() + 1}/${d.getDate()}`; }

// ── ScheduleView ─────────────────────────────────────────────────────

function ScheduleView({ data, person, sheetId }: { data: SheetData; person: string; sheetId: string }) {
  const h = data.headers;
  const fi = (needle: string, fallback: number) => { const i = h.findIndex(x => x.includes(needle)); return i >= 0 ? i : fallback; };
  const personIdx = fi('聯絡人員', 1);
  const vendorIdx = fi('網站名稱', 2);
  const monthIdx  = fi('月份', 6);
  const dayIdx    = fi('日期', 7);
  const kwIdx     = fi('關鍵字', 10);

  const tabName  = data.tabName ?? '';
  const rowOffset = data.rowOffset ?? 2;

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const hasPending = Object.keys(pendingChanges).length > 0;

  const groups = useMemo(() => parseWeekGroups(data.rows), [data.rows]);
  const { thisIdx, nextIdx, mon, sun, nextMon, nextSun } = useMemo(
    () => findWeekGroups(groups, monthIdx, dayIdx), [groups, monthIdx, dayIdx]
  );

  useEffect(() => {
    if (!hasPending) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPending]);

  function dv(idx: number, ci: number) {
    return pendingChanges[`${idx}_${ci}`] ?? data.rows[idx]?.[ci] ?? '';
  }

  function handleChange(idx: number, ci: number, v: string) {
    setPendingChanges(prev => ({ ...prev, [`${idx}_${ci}`]: v }));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(pendingChanges).map(([key, value]) => {
          const [idxStr, ciStr] = key.split('_');
          const sheetRow = Number(idxStr) + rowOffset;
          return fetch('/api/writer/sheets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetId, tabName, sheetRow, colIdx: Number(ciStr), value }),
          });
        })
      );
      setPendingChanges({});
    } finally { setSaving(false); }
  }

  function filterGroup(group: IndexedRow[] | undefined) {
    if (!group) return [];
    if (!person || person === '全部') return group;
    return group.filter(({ row }) => row[personIdx]?.trim() === person);
  }

  const COLS = [
    { label: '客戶', ci: vendorIdx, cls: 'w-36' },
    { label: '關鍵字', ci: kwIdx, cls: '' },
    { label: '寫文日期', ci: dayIdx, cls: 'w-24' },
  ];

  function renderGroup(group: IndexedRow[] | undefined, label: string, dateRange: string) {
    const rows = filterGroup(group);
    return (
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-gray-800">{label}</h2>
          <span className="text-xs text-gray-400">{dateRange}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 pl-1">沒有符合的任務</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {COLS.map(c => (
                    <th key={c.ci} className={`px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide ${c.cls}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(({ row: _row, idx }, i) => (
                  <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                    {COLS.map(c => (
                      <td key={c.ci} className="px-2 py-1.5">
                        {c.ci === kwIdx && dv(idx, c.ci) ? (
                          <div className="flex items-center gap-1.5 px-1 py-0.5">
                            <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{dv(idx, c.ci)}</span>
                            <a
                              href={`/writer/compose?keyword=${encodeURIComponent(dv(idx, c.ci))}&vendor=${encodeURIComponent(dv(idx, vendorIdx))}`}
                              className="flex-shrink-0 text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap"
                            >
                              寫文
                            </a>
                          </div>
                        ) : (
                          <PPCell
                            value={dv(idx, c.ci)}
                            isDirty={`${idx}_${c.ci}` in pendingChanges}
                            onChange={v => handleChange(idx, c.ci, v)}
                            statusOptions={[]}
                            isStatus={false}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasPending && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <span className="text-xs text-amber-700">有未儲存的變更</span>
          <button onClick={saveAll} disabled={saving}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      )}
      {renderGroup(groups[thisIdx], '本週', `${fmtDate(mon)} – ${fmtDate(sun)}`)}
      {nextIdx >= 0 && renderGroup(groups[nextIdx], '下週', `${fmtDate(nextMon)} – ${fmtDate(nextSun)}`)}
    </div>
  );
}

// ── 狀態色塊 ──────────────────────────────────────────────────────────

function statusStyle(s: string): string {
  if (!s) return 'bg-gray-100 text-gray-400';
  if (s.includes('完成') || s.includes('已發') || s.includes('上架')) return 'bg-emerald-100 text-emerald-700';
  if (s.includes('修改') || s.includes('審稿') || s.includes('客戶')) return 'bg-amber-100 text-amber-700';
  if (s.includes('中') || s.includes('寫作') || s.includes('撰寫')) return 'bg-blue-100 text-blue-700';
  if (s.includes('待') || s.includes('未') || s.includes('尚未')) return 'bg-gray-100 text-gray-500';
  if (s.includes('發布') || s.includes('排程')) return 'bg-purple-100 text-purple-700';
  return 'bg-slate-100 text-slate-600';
}

// ── PersonalProgressTable ─────────────────────────────────────────────

function PPCell({ value, isDirty, onChange, statusOptions, isStatus }: {
  value: string; isDirty: boolean; onChange: (v: string) => void;
  statusOptions: string[]; isStatus: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => { if (!editing) setLocalVal(value); }, [value, editing]);

  if (isStatus) {
    const opts = Array.from(new Set([...statusOptions, value].filter(Boolean)));
    return (
      <div className="relative">
        <select
          className={`text-xs font-medium px-2.5 py-1 rounded-full appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 transition-all pr-5 ${statusStyle(value)} ${isDirty ? 'ring-1 ring-amber-400' : ''}`}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {!value && <option value="">—</option>}
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="">（清空）</option>
        </select>
        <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    );
  }

  if (editing) {
    return (
      <input autoFocus
        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white shadow-sm min-w-[8rem]"
        value={localVal}
        onChange={e => setLocalVal(e.target.value)}
        onBlur={() => { onChange(localVal); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onChange(localVal); setEditing(false); } if (e.key === 'Escape') { setLocalVal(value); setEditing(false); } }}
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)}
      className={`group w-full text-left rounded-lg px-2 py-1 text-sm transition-colors hover:bg-gray-100 ${isDirty ? 'bg-amber-50' : ''}`}>
      <span className={value ? 'text-gray-800' : 'text-gray-300 group-hover:text-gray-400'}>
        {value || '點擊編輯'}
      </span>
    </button>
  );
}

function PersonalProgressTable({ data, sheetId, person, onRefresh }: {
  data: SheetData; sheetId: string; person: string; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localRows, setLocalRows] = useState<string[][]>([]);
  const [deletedIdxs, setDeletedIdxs] = useState<Set<number>>(new Set());
  // key: `${rowIdx}_${colIdx}` → new value
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  // local row edits: `local_${localIdx}_${colIdx}` → new value
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({});

  const hasPending = Object.keys(pendingChanges).length > 0 || Object.keys(localChanges).length > 0;

  // data 換新時清除 pending
  useEffect(() => {
    setPendingChanges({});
    setLocalChanges({});
    setLocalRows([]);
    setDeletedIdxs(new Set());
  }, [data]);

  // 離開頁面提醒
  useEffect(() => {
    if (!hasPending) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPending]);
  const h = data.headers;
  const fi = (needle: string, fallback: number) => { const i = h.findIndex(x => x.includes(needle)); return i >= 0 ? i : fallback; };
  const titleIdx  = fi('文章標題', 3);
  const statusIdx = fi('文章狀態', 4);
  const personIdx = fi('人員', 1);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    data.rows.forEach(row => { const s = row[statusIdx]?.trim(); if (s) set.add(s); });
    return Array.from(set);
  }, [data.rows, statusIdx]);

  const visibleCount = expanded ? h.length : statusIdx + 1;
  const visibleHeaders = h.slice(0, visibleCount);
  // 已有資料的列（過濾空標題、過濾已刪除） + 本地新增的列（不過濾）
  const sheetRows = data.rows
    .map((row, idx) => ({ row, idx, isLocal: false }))
    .filter(({ row, idx }) => row[titleIdx]?.trim() && !deletedIdxs.has(idx));
  const localIndexed = localRows.map((row, i) => ({ row, idx: data.rows.length + i, isLocal: true }));
  const rows = [...sheetRows, ...localIndexed];
  const tabName = data.tabName ?? '';
  const rowOffset = data.rowOffset ?? 2;

  async function deleteRowAt(idx: number, isLocal: boolean, sheetRow: number) {
    if (isLocal) {
      const localIdx = idx - data.rows.length;
      setLocalRows(prev => prev.filter((_, i) => i !== localIdx));
      return;
    }
    // 樂觀更新：先隱藏列
    setDeletedIdxs(prev => new Set(prev).add(idx));
    try {
      const res = await fetch('/api/writer/sheets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, tabName, sheetRow }),
      });
      if (res.ok) {
        // 刪除成功：同步重新載入讓列號重算
        onRefresh();
      } else {
        // 失敗：還原
        setDeletedIdxs(prev => { const next = new Set(prev); next.delete(idx); return next; });
      }
    } catch {
      setDeletedIdxs(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }
  }

  function buildInitialValues() {
    const vals = Array(h.length).fill('');
    if (personIdx >= 0) vals[personIdx] = person;
    if (titleIdx >= 0) vals[titleIdx] = '待輸入';
    return vals;
  }

  function displayValue(idx: number, ci: number, isLocal: boolean): string {
    if (isLocal) {
      const localIdx = idx - data.rows.length;
      return localChanges[`local_${localIdx}_${ci}`] ?? localRows[localIdx]?.[ci] ?? '';
    }
    return pendingChanges[`${idx}_${ci}`] ?? data.rows[idx]?.[ci] ?? '';
  }

  function handleChange(idx: number, ci: number, isLocal: boolean, newVal: string) {
    if (isLocal) {
      const localIdx = idx - data.rows.length;
      setLocalChanges(prev => ({ ...prev, [`local_${localIdx}_${ci}`]: newVal }));
    } else {
      setPendingChanges(prev => ({ ...prev, [`${idx}_${ci}`]: newVal }));
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      // 儲存 sheet rows 的修改
      const sheetSaves = Object.entries(pendingChanges).map(([key, value]) => {
        const [idxStr, ciStr] = key.split('_');
        const idx = Number(idxStr);
        const ci = Number(ciStr);
        const sheetRow = idx + rowOffset;
        return fetch('/api/writer/sheets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetId, tabName, sheetRow, colIdx: ci, value }),
        });
      });
      // 儲存 local rows 的修改（local rows 已寫入 sheet，只是 pending cell edits）
      const localSaves = Object.entries(localChanges).map(([key, value]) => {
        const parts = key.split('_'); // local_localIdx_ci
        const localIdx = Number(parts[1]);
        const ci = Number(parts[2]);
        // local rows 的 sheetRow 無法精確知道，先略過（等 refresh 後再編輯）
        void localIdx; void ci;
        return Promise.resolve();
      });
      await Promise.all([...sheetSaves, ...localSaves]);
      setPendingChanges({});
      setLocalChanges({});
      onRefresh();
    } finally { setSaving(false); }
  }

  async function insertRowAt(sheetRow: number) {
    const initialValues = buildInitialValues();
    try {
      const res = await fetch('/api/writer/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, tabName, sheetRow, initialValues }),
      });
      if (res.ok) onRefresh();
    } catch { /* ignore */ }
  }

  async function addRow() {
    setAdding(true);
    const initialValues = buildInitialValues();
    setLocalRows(prev => [...prev, [...initialValues]]);
    try {
      await fetch('/api/writer/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, tabName, initialValues }),
      });
    } finally { setAdding(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {h.length > visibleCount && !expanded ? (
            <button onClick={() => setExpanded(true)}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
              展開其餘 {h.length - visibleCount} 個欄位
            </button>
          ) : expanded ? (
            <button onClick={() => setExpanded(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              收起額外欄位
            </button>
          ) : null}
          {hasPending && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              有未儲存的變更
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasPending && (
            <button onClick={saveAll} disabled={saving}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? '儲存中…' : '儲存'}
            </button>
          )}
          <button onClick={addRow} disabled={adding}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {adding ? '新增中…' : '新增一列'}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">此分頁無資料</p>
      ) : (
        <div className={`${expanded ? 'overflow-x-auto' : 'overflow-x-hidden'} rounded-xl border border-gray-200 bg-white`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-12" />
                {visibleHeaders.map((col, i) => (
                  <th key={i} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {col || `欄 ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(({ row, idx, isLocal }, ri) => {
                const sheetRow = idx + rowOffset;
                return (
                  <tr key={ri} className={`group hover:bg-gray-50/60 transition-colors ${isLocal ? 'bg-blue-50/40' : ''}`}>
                    <td className="w-12 pl-1">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => insertRowAt(sheetRow)}
                          className="text-gray-300 hover:text-blue-500 p-0.5 rounded transition-colors"
                          title="在此列前插入"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button
                          onClick={() => deleteRowAt(idx, isLocal, sheetRow)}
                          className="text-gray-300 hover:text-red-500 p-0.5 rounded transition-colors"
                          title="刪除此列"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </td>
                    {visibleHeaders.map((_, ci) => {
                      const cellVal = displayValue(idx, ci, isLocal);
                      const cellKey = isLocal ? `local_${idx - data.rows.length}_${ci}` : `${idx}_${ci}`;
                      const dirty = cellKey in pendingChanges || cellKey in localChanges;
                      return (
                        <td key={ci} className="px-2 py-1.5">
                          <PPCell
                            value={cellVal}
                            isDirty={dirty}
                            onChange={v => handleChange(idx, ci, isLocal, v)}
                            statusOptions={statusOptions}
                            isStatus={ci === statusIdx}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ProgressTable ─────────────────────────────────────────────────────

const HIDDEN_PROGRESS_COLS = new Set(['網站名稱', '網站類型', '類型', '進度登記', '排名']);

function ProgressTable({ data }: { data: SheetData }) {
  const [localChecks, setLocalChecks] = useState<Record<number, boolean>>({});
  const [checkSaving, setCheckSaving] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ rowIdx: number; ci: number } | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => { setLocalChecks({}); setPending({}); setEditing(null); }, [data]);

  const h = data.headers;
  const tabName = data.tabName ?? '';
  const rowOffset = data.rowOffset ?? 2;
  const sheetId = data.sheetId ?? '';

  const uploadColIdx = h.findIndex(col => col.trim() === '上架');
  const titleIdx = h.findIndex(col => col.includes('文章標題'));

  const visibleCols = h
    .map((header, ci) => ({ header, ci }))
    .filter(({ header }) => !HIDDEN_PROGRESS_COLS.has(header.trim()));

  const rows = data.rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => titleIdx < 0 || row[titleIdx]?.trim());

  async function toggleCheck(rowIdx: number, current: boolean) {
    if (!sheetId || uploadColIdx < 0) return;
    setLocalChecks(prev => ({ ...prev, [rowIdx]: !current }));
    setCheckSaving(prev => new Set(prev).add(rowIdx));
    try {
      await fetch('/api/writer/sheets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, tabName, sheetRow: rowIdx + rowOffset, colIdx: uploadColIdx, value: current ? '' : 'V' }),
      });
    } catch {
      setLocalChecks(prev => ({ ...prev, [rowIdx]: current }));
    } finally {
      setCheckSaving(prev => { const next = new Set(prev); next.delete(rowIdx); return next; });
    }
  }

  function startEdit(rowIdx: number, ci: number, current: string) {
    setEditing({ rowIdx, ci });
    setEditVal(current);
  }

  async function commitEdit(rowIdx: number, ci: number, newVal: string) {
    setEditing(null);
    const key = `${rowIdx}_${ci}`;
    const original = data.rows[rowIdx]?.[ci] ?? '';
    if (newVal === original) return;
    setPending(prev => ({ ...prev, [key]: newVal }));
    try {
      await fetch('/api/writer/sheets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, tabName, sheetRow: rowIdx + rowOffset, colIdx: ci, value: newVal }),
      });
    } catch {
      setPending(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">此 Sheet 無資料</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {visibleCols.map(({ header, ci }) => (
              <th key={ci} className={`px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap ${header.trim() === '上架' ? 'w-16 text-center' : ''}`}>
                {header || `欄 ${ci + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, idx }, ri) => (
            <tr key={ri} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              {visibleCols.map(({ header, ci }) => {
                if (header.trim() === '上架' && uploadColIdx >= 0) {
                  const rawVal = row[ci]?.trim() ?? '';
                  const isChecked = idx in localChecks ? localChecks[idx] : (rawVal !== '' && rawVal !== '0');
                  const isSaving = checkSaving.has(idx);
                  return (
                    <td key={ci} className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => toggleCheck(idx, isChecked)}
                        disabled={isSaving || !sheetId}
                        className={`w-5 h-5 rounded border-2 inline-flex items-center justify-center transition-all ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 bg-white hover:border-gray-400'} ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {isChecked && (
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    </td>
                  );
                }

                const key = `${idx}_${ci}`;
                const cellVal = key in pending ? pending[key] : (row[ci] ?? '');
                const isEditing = editing?.rowIdx === idx && editing?.ci === ci;
                const isDirty = key in pending;

                return (
                  <td key={ci} className="px-2 py-1.5 max-w-xs">
                    {isEditing ? (
                      <input
                        autoFocus
                        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white shadow-sm min-w-[8rem]"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(idx, ci, editVal)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(idx, ci, editVal);
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(idx, ci, cellVal)}
                        className={`group w-full text-left rounded-lg px-2 py-1 text-sm transition-colors hover:bg-gray-100 truncate ${isDirty ? 'bg-amber-50' : ''}`}
                      >
                        <span className={cellVal ? 'text-gray-800' : 'text-gray-300 group-hover:text-gray-400'}>
                          {cellVal || '點擊編輯'}
                        </span>
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── SheetTable ────────────────────────────────────────────────────────

function SheetTable({ data }: { data: SheetData }) {
  if (data.headers.length === 0 && data.rows.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">此 Sheet 無資料</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {data.headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap">
                {h || `欄 ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
              {data.headers.map((_, ci) => (
                <td key={ci} className="px-4 py-2.5 text-gray-700 whitespace-nowrap max-w-xs truncate">
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="bg-gray-100 h-10" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-t border-gray-100">
          {[...Array(4)].map((_, j) => <div key={j} className="h-4 bg-gray-200 rounded flex-1" />)}
        </div>
      ))}
    </div>
  );
}

// ── Add Client Modal ──────────────────────────────────────────────────

function ClientModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [tab, setTab] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!name.trim() || !sheetUrl.trim()) { setErr('請填入客戶名稱與 Sheet 網址'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/writer/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), progressSheetId: sheetUrl.trim(), progressSheetTab: tab.trim() }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) { setErr(json.error ?? '儲存失敗'); setSaving(false); return; }
    onSave(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900">新增客戶進度 Sheet</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客戶名稱</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              value={name} onChange={e => setName(e.target.value)} placeholder="例：ABC 公司" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">進度 Sheet 網址或 ID</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
              value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="貼上 Google Sheets 網址或 Sheet ID" />
            <p className="mt-1 text-xs text-gray-400">可直接貼上完整網址，會自動解析 Sheet ID</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">分頁名稱（選填）</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              value={tab} onChange={e => setTab(e.target.value)} placeholder="留空表示讀取第一個分頁" />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────

function SettingsModal({ initial, onClose, onSave }: {
  initial: WriterSettings; onClose: () => void; onSave: (s: WriterSettings) => void;
}) {
  const [form, setForm] = useState<WriterSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set(k: keyof WriterSettings, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    setSaving(true); setErr('');
    const res = await fetch('/api/writer/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (!res.ok) { setErr('儲存失敗'); setSaving(false); return; }
    onSave(form); onClose();
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900">Sheet 設定</h2>
        <p className="text-sm text-gray-500 -mt-3">每月換新的試算表時，在這裡貼上新網址即可。</p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-700">每日排程 Sheet</legend>
          <input className={`${inputCls} font-mono`} placeholder="貼上 Google Sheets 網址或 Sheet ID"
            value={form.schedule_sheet_id} onChange={e => set('schedule_sheet_id', e.target.value)} />
          <input className={inputCls} placeholder="分頁名稱（選填，留空讀取第一個分頁）"
            value={form.schedule_sheet_tab} onChange={e => set('schedule_sheet_tab', e.target.value)} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-700">個人進度追蹤 Sheet</legend>
          <input className={`${inputCls} font-mono`} placeholder="貼上 Google Sheets 網址或 Sheet ID"
            value={form.progress_tracking_sheet_id} onChange={e => set('progress_tracking_sheet_id', e.target.value)} />
          <p className="text-xs text-gray-400">選擇人員後自動對應同名分頁（分頁名稱須與聯絡人員欄位相同）。</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-700">寫文 AI 模型</legend>
          <select className={inputCls} value={form.openrouter_model} onChange={e => set('openrouter_model', e.target.value)}>
            <optgroup label="✦ GPT（OpenAI）— 通用能力強，格式穩定">
              <option value="openai/gpt-4o-mini">GPT-4o mini — 性價比高，速度快｜費用低 ✓ 推薦</option>
              <option value="openai/gpt-4o">GPT-4o — 旗艦，能力全面｜費用中高</option>
            </optgroup>
            <optgroup label="✦ Gemini（Google）— 速度極快，適合大量產出">
              <option value="google/gemini-1.5-flash">Gemini 1.5 Flash — 超快速，大量產出｜費用極低</option>
              <option value="google/gemini-1.5-pro">Gemini 1.5 Pro — 長文理解強｜費用中等</option>
            </optgroup>
            <optgroup label="✦ Claude（Anthropic）— 中文最自然（需在 OpenRouter 另行開啟 Anthropic 存取）">
              <option value="anthropic/claude-3.5-sonnet-20241022">Claude 3.5 Sonnet — 強力寫作，邏輯清晰｜費用中高</option>
              <option value="anthropic/claude-3-haiku-20240307">Claude 3 Haiku — 速度快，適合草稿｜費用低</option>
            </optgroup>
          </select>
          <p className="text-xs text-gray-400">不確定選哪個？選「GPT-4o mini」即可，速度快、費用低、品質穩定。Claude 系列需先至 openrouter.ai 帳號設定開啟 Anthropic。</p>
        </fieldset>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function WriterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [cache, setCache] = useState<Partial<Record<string, SheetData>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<WriterSettings>({
    schedule_sheet_id: '', schedule_sheet_tab: '',
    clients_sheet_id: '', clients_sheet_tab: '',
    progress_tracking_sheet_id: '',
    openrouter_model: '',
  });
  const [showSettings, setShowSettings] = useState(false);

  const [selectedPerson, setSelectedPerson] = useState('全部');
  const [people, setPeople] = useState<string[]>([]);

  const [writerClients, setWriterClients] = useState<WriterClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/writer/settings').then(r => r.json()).then(setSettings);
  }, []);

  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/gsc/clients');
    const json = await res.json() as { id: number; name: string; article_sheet_id: string; article_sheet_tab: string }[];
    const filtered = json
      .filter(c => c.article_sheet_id)
      .map(c => ({ id: c.id, name: c.name, article_sheet_id: c.article_sheet_id, article_sheet_tab: c.article_sheet_tab }));
    setWriterClients(filtered);
    if (filtered.length > 0 && !selectedClientId) setSelectedClientId(filtered[0].id);
  }, [selectedClientId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // 從排程資料提取人員清單
  useEffect(() => {
    const d = cache['schedule'];
    if (!d) return;
    const pIdx = Math.max(0, d.headers.findIndex(x => x.includes('聯絡人員'))) || 1;
    const set = new Set<string>();
    d.rows.forEach(row => { const p = row[pIdx]?.trim(); if (p) set.add(p); });
    setPeople(Array.from(set).sort());
  }, [cache]);

  const loadSheet = useCallback(async (cacheKey: string, url: string) => {
    if (cache[cacheKey]) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json() as SheetData & { error?: string };
      if (!res.ok || json.error) { setError(json.error ?? '讀取失敗'); }
      else { setCache(prev => ({ ...prev, [cacheKey]: json })); }
    } catch { setError('網路連線失敗，請重試'); }
    finally { setLoading(false); }
  }, [cache]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      loadSheet('schedule', '/api/writer/sheets?sheet=schedule');
    } else if (activeTab === 'progress' && selectedClientId) {
      loadSheet(`progress-${selectedClientId}`, `/api/gsc/article-sheet?clientId=${selectedClientId}`);
    } else if (activeTab === 'personal' && settings.progress_tracking_sheet_id && selectedPerson !== '全部') {
      const rawId = settings.progress_tracking_sheet_id;
      const sheetId = rawId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? rawId.trim();
      loadSheet(`personal-${selectedPerson}`, `/api/writer/sheets?sheet=progress&sheetId=${sheetId}&tab=${encodeURIComponent(selectedPerson)}&skip=1`);
    }
  }, [activeTab, selectedClientId, writerClients, selectedPerson, settings.progress_tracking_sheet_id, loadSheet]);

  function refresh() {
    if (activeTab === 'progress' && selectedClientId) {
      setCache(prev => { const next = { ...prev }; delete next[`progress-${selectedClientId}`]; return next; });
    } else if (activeTab === 'personal') {
      setCache(prev => { const next = { ...prev }; delete next[`personal-${selectedPerson}`]; return next; });
    } else {
      setCache(prev => { const next = { ...prev }; delete next[activeTab]; return next; });
    }
  }

  const progressClient = writerClients.find(c => c.id === selectedClientId);
  const scheduleData  = cache['schedule'];
  const progressData  = progressClient ? cache[`progress-${progressClient.id}`] : undefined;
  const personalData  = cache[`personal-${selectedPerson}`];
  const scheduleConfigured = !!settings.schedule_sheet_id;
  const personalConfigured = !!settings.progress_tracking_sheet_id;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">寫手流程工具</h1>
          <p className="mt-1 text-sm text-gray-500">查看本週 / 下週任務、客戶進度與個人進度</p>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          設定
        </button>
      </div>

      {/* 全域人員選擇器 */}
      {people.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 shrink-0">人員：</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={selectedPerson}
            onChange={e => {
              setSelectedPerson(e.target.value);
              setError(null);
              setCache(prev => {
                const next = { ...prev };
                Object.keys(next).filter(k => k.startsWith('personal-')).forEach(k => delete next[k]);
                return next;
              });
            }}
          >
            <option value="全部">全部</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setError(null); }}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${activeTab === tab.key ? 'border-gray-900 text-gray-900 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={refresh} className="mb-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          重新整理
        </button>
      </div>

      {/* 進度登記：客戶選擇器 */}
      {activeTab === 'progress' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 shrink-0">客戶：</label>
          {writerClients.length === 0 ? (
            <p className="text-sm text-gray-400">尚未有 GSC 客戶設定文章 Sheet</p>
          ) : (
            <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              value={selectedClientId ?? ''} onChange={e => { setSelectedClientId(Number(e.target.value)); setError(null); }}>
              {writerClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <a href="/gsc" className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            管理 GSC 客戶
          </a>
        </div>
      )}

      {/* Not configured notices */}
      {activeTab === 'schedule' && !scheduleConfigured && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          尚未設定每日排程 Sheet，請點右上角「設定」填入試算表網址。
        </div>
      )}
      {activeTab === 'personal' && !personalConfigured && !error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          尚未設定個人進度追蹤 Sheet，請點右上角「設定」填入試算表網址。
        </div>
      )}

      {/* Content */}
      <div>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 space-y-1">
            <p className="font-medium">讀取失敗</p><p>{error}</p>
            {(error.includes('尚未授權') || error.includes('refresh_token')) && (
              <p className="mt-2">請先至 <a href="/gsc" className="underline font-medium">GSC 工具</a> 完成 Google 帳號授權。</p>
            )}
            {error.includes('尚未設定') && <p className="mt-2">請點右上角「設定」填入 Sheet 網址。</p>}
          </div>
        ) : activeTab === 'schedule' ? (
          loading || (!scheduleData && scheduleConfigured) ? <SkeletonTable /> :
          scheduleData ? <ScheduleView data={scheduleData} person={selectedPerson} sheetId={(() => { const r = settings.schedule_sheet_id; return r.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? r.trim(); })()} /> : null
        ) : activeTab === 'progress' ? (
          writerClients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
              <p className="text-sm text-gray-400 mb-3">尚未有 GSC 客戶設定文章 Sheet</p>
              <a href="/gsc" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
                前往 GSC 客戶設定
              </a>
            </div>
          ) : !progressClient ? (
            <p className="text-sm text-gray-400 py-8 text-center">請選擇一個客戶</p>
          ) : loading || !progressData ? <SkeletonTable /> :
          <ProgressTable data={progressData} />
        ) : activeTab === 'personal' ? (
          selectedPerson === '全部' ? (
            <p className="text-sm text-gray-400 py-8 text-center">請從上方人員選單選擇一位寫手</p>
          ) : loading || !personalData ? <SkeletonTable /> : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">顯示 {selectedPerson} 的進度</p>
              <PersonalProgressTable
                data={personalData}
                sheetId={(() => { const r = settings.progress_tracking_sheet_id; return r.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? r.trim(); })()}
                person={selectedPerson}
                onRefresh={() => {
                  setCache(prev => { const next = { ...prev }; delete next[`personal-${selectedPerson}`]; return next; });
                }}
              />
            </div>
          )
        ) : null}
      </div>

      {showSettings && (
        <SettingsModal initial={settings} onClose={() => setShowSettings(false)}
          onSave={(s) => { setSettings(s); setCache({}); }} />
      )}
    </div>
  );
}
