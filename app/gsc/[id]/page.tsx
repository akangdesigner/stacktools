'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

interface GscKeyword { id: number; client_id: number; keyword: string; label: string }
interface GscClient { id: number; name: string; site_url: string; keywords: GscKeyword[] }
interface SingleResult { found: boolean; position?: number; clicks?: number; impressions?: number; ctr?: number }
interface KwResult { keyword: string; a: SingleResult; b: SingleResult }
interface QueryResult {
  results: KwResult[];
  aRange: { start: string; end: string };
  bRange: { start: string; end: string };
}

function TrendCell({ a, b }: { a: SingleResult; b: SingleResult }) {
  if (!a.found && !b.found) return <td className="px-3 py-2 text-center text-gray-300 text-xs">—</td>;
  const aPos = a.found ? a.position! : null;
  const bPos = b.found ? b.position! : null;
  if (aPos == null || bPos == null) return <td className="px-3 py-2 text-center text-gray-400 text-xs">新</td>;
  const diff = aPos - bPos;
  if (Math.abs(diff) < 0.05) return <td className="px-3 py-2 text-center text-gray-400 text-xs">—</td>;
  if (diff > 0) return <td className="px-3 py-2 text-center text-red-500 text-xs font-medium">↑ {Math.abs(diff).toFixed(1)}</td>;
  return <td className="px-3 py-2 text-center text-emerald-600 text-xs font-medium">↓ {Math.abs(diff).toFixed(1)}</td>;
}

function KeywordEditor({ client, onSaved }: { client: GscClient; onSaved: () => void }) {
  const [raw, setRaw] = useState(() =>
    client.keywords.map(k => `${k.label ? k.label + '  ' : ''}${k.keyword}`).join('\n')
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const keywords = raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        if (line.includes('\t')) {
          const [first, ...rest] = line.split('\t');
          const second = rest.join('\t').trim();
          if (first.trim().length <= 4) return { keyword: second, label: first.trim() };
          return { keyword: first.trim(), label: second };
        }
        const spaceParts = line.split(/\s{2,}/);
        if (spaceParts.length >= 2) {
          const first = spaceParts[0].trim();
          const second = spaceParts.slice(1).join(' ').trim();
          if (first.length <= 4) return { keyword: second, label: first };
          return { keyword: first, label: second };
        }
        return { keyword: line, label: '' };
      });
    await fetch('/api/gsc/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, keywords }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">每行一個關鍵字，備註可寫在前或後（例：核心  外泌體，或 外泌體  核心）</p>
      <textarea
        value={raw}
        onChange={e => setRaw(e.target.value)}
        rows={14}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y"
      />
      <button
        onClick={save}
        disabled={saving}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {saving ? '儲存中…' : '儲存關鍵字'}
      </button>
    </div>
  );
}

export default function GscClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<GscClient | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showKeywordEditor, setShowKeywordEditor] = useState(false);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  function loadClient() {
    fetch('/api/gsc/clients')
      .then(r => r.json())
      .then((list: GscClient[]) => {
        const found = list.find(c => String(c.id) === id);
        setClient(found ?? null);
      });
  }

  useEffect(() => { loadClient(); }, [id]);

  useEffect(() => {
    fetch('/api/gsc/status')
      .then(r => r.json())
      .then((d: { authorized: boolean }) => setAuthorized(d.authorized))
      .finally(() => setAuthChecked(true));
  }, []);

  async function deleteClient() {
    if (!client || !confirm('確定刪除此客戶？')) return;
    await fetch('/api/gsc/clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id }),
    });
    router.push('/gsc');
  }

  async function handleQuery() {
    if (!client) return;
    const keywords = client.keywords.map(k => k.keyword);
    if (!keywords.length) { setError('請先設定關鍵字'); return; }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError('');
    setQueryResult(null);

    try {
      const res = await fetch('/api/gsc/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: client.site_url, keywords, endDate }),
        signal: abortRef.current.signal,
      });
      const data = await res.json() as QueryResult & { error?: string };
      if (!res.ok) setError(data.error ?? '查詢失敗');
      else setQueryResult(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!client) return <div className="p-8 text-sm text-gray-400">載入中…</div>;

  const labelGroups = queryResult
    ? [...new Set(queryResult.results.map(r => client.keywords.find(k => k.keyword === r.keyword)?.label ?? ''))]
    : [];

  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <button onClick={() => router.push('/gsc')} className="hover:text-gray-700 transition-colors">GSC 排名</button>
        <span>/</span>
        <span className="text-gray-700 font-medium">{client.name}</span>
      </div>

      {/* 客戶資訊 */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
          <button onClick={deleteClient} className="text-xs text-red-400 hover:text-red-600">刪除</button>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{client.site_url}</p>
      </div>

      {/* GSC 授權狀態 */}
      {!authChecked && <p className="text-sm text-gray-400">檢查授權狀態…</p>}
      {authChecked && !authorized && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 max-w-md">
          <p className="text-sm text-gray-700 font-medium">尚未連結 Google 帳號</p>
          <a href="/api/gsc/auth" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/>
            </svg>
            連結 Google 帳號
          </a>
        </div>
      )}
      {authChecked && authorized && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 flex items-center gap-2 max-w-md">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          <p className="text-sm text-emerald-700">Google 帳號已連結</p>
          <a href="/api/gsc/auth" className="ml-auto text-xs text-emerald-600 hover:underline">重新授權</a>
        </div>
      )}

      {/* 關鍵字編輯開關 */}
      <button
        onClick={() => setShowKeywordEditor(v => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/>
        </svg>
        {showKeywordEditor ? '收起關鍵字' : `追蹤關鍵字（${client.keywords.length} 個）`}
      </button>

      {showKeywordEditor && (
        <KeywordEditor
          key={client.id}
          client={client}
          onSaved={() => { loadClient(); setShowKeywordEditor(false); }}
        />
      )}

      {/* 查詢控制 */}
      {!showKeywordEditor && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">抓取日期</label>
            <input
              type="date"
              value={endDate}
              max={defaultEndDate()}
              onChange={e => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            <p className="text-xs text-gray-400">以此日期往前推 90 天計算平均排名，因 GSC 延遲建議選兩天前</p>
          </div>
          <button
            onClick={handleQuery}
            disabled={loading || !endDate || !client.keywords.length}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '查詢中…' : '查詢排名'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {/* 結果表格 */}
      {queryResult && !showKeywordEditor && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-4 text-xs text-gray-400">
            <span>上週：{fmtDate(queryResult.aRange.start)} ~ {fmtDate(queryResult.aRange.end)}</span>
            <span>本週：{fmtDate(queryResult.bRange.start)} ~ {fmtDate(queryResult.bRange.end)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-medium">
                <th className="px-4 py-2 text-left">關鍵字</th>
                <th className="px-3 py-2 text-left">標籤</th>
                <th className="px-3 py-2 text-center">上週排名</th>
                <th className="px-3 py-2 text-center">本週排名</th>
                <th className="px-3 py-2 text-center">變化</th>
                <th className="px-3 py-2 text-center">本週點擊</th>
                <th className="px-3 py-2 text-center">本週曝光</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {labelGroups.map(label =>
                queryResult.results
                  .filter(r => (client.keywords.find(k => k.keyword === r.keyword)?.label ?? '') === label)
                  .map(r => {
                    const kwMeta = client.keywords.find(k => k.keyword === r.keyword);
                    return (
                      <tr key={r.keyword} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-800">{r.keyword}</td>
                        <td className="px-3 py-2">
                          {kwMeta?.label && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{kwMeta.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500">{r.a.found ? `#${r.a.position}` : '—'}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-800">{r.b.found ? `#${r.b.position}` : '—'}</td>
                        <TrendCell a={r.a} b={r.b} />
                        <td className="px-3 py-2 text-center text-gray-600">{r.b.found ? r.b.clicks?.toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.b.found ? r.b.impressions?.toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
