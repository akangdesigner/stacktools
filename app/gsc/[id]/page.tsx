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
interface GscArticlePage { id: number; client_id: number; type: string; title: string; url: string }
interface GscClient {
  id: number; name: string; site_url: string;
  sheet_id: string; sheet_tab: string; auto_update: number;
  article_sheet_id: string; article_sheet_tab: string;
  keywords: GscKeyword[]; article_pages: GscArticlePage[];
}
interface SingleResult { found: boolean; position?: number; clicks?: number; impressions?: number; ctr?: number }
interface KwResult { keyword: string; a: SingleResult; b: SingleResult }
interface QueryResult { results: KwResult[]; aRange: { start: string; end: string }; bRange: { start: string; end: string } }
interface ArticleRankResult { type: string; title: string; url: string; position: number | null }

function TrendCell({ a, b }: { a: SingleResult; b: SingleResult }) {
  if (!a.found && !b.found) return <td className="px-3 py-2 text-center text-gray-300 text-xs">-</td>;
  const aPos = a.found ? a.position! : null;
  const bPos = b.found ? b.position! : null;
  if (aPos == null || bPos == null) return <td className="px-3 py-2 text-center text-gray-400 text-xs">新</td>;
  const diff = aPos - bPos;
  if (Math.abs(diff) < 0.05) return <td className="px-3 py-2 text-center text-gray-400 text-xs">-</td>;
  if (diff > 0) return <td className="px-3 py-2 text-center text-red-500 text-xs font-medium">↑ {Math.abs(diff).toFixed(1)}</td>;
  return <td className="px-3 py-2 text-center text-emerald-600 text-xs font-medium">↓ {Math.abs(diff).toFixed(1)}</td>;
}

function parseSheetUrl(url: string): { sheetId: string; gid: string } | null {
  try {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return null;
    const sheetId = m[1];
    const gidM = url.match(/[?&#]gid=(\d+)/);
    return { sheetId, gid: gidM ? gidM[1] : '' };
  } catch { return null; }
}

function SheetEditor({ client, onSaved }: { client: GscClient; onSaved: () => void }) {
  const [url, setUrl] = useState(client.sheet_id ? `https://docs.google.com/spreadsheets/d/${client.sheet_id}` : '');
  const [sheetId, setSheetId] = useState(client.sheet_id);
  const [sheetTab, setSheetTab] = useState(client.sheet_tab);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleUrlBlur() {
    const parsed = parseSheetUrl(url);
    if (!parsed) return;
    setResolving(true); setResolveError('');
    try {
      const res = await fetch(`/api/gsc/sheet-meta?sheetId=${parsed.sheetId}&gid=${parsed.gid}`);
      const data = await res.json() as { tab?: string; error?: string };
      if (!res.ok) { setResolveError(data.error ?? '無法讀取'); return; }
      setSheetId(parsed.sheetId);
      if (data.tab) setSheetTab(data.tab);
    } finally { setResolving(false); }
  }

  async function save() {
    setSaving(true);
    await fetch('/api/gsc/clients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name: client.name, site_url: client.site_url, sheet_id: sheetId, sheet_tab: sheetTab, auto_update: client.auto_update === 1, article_sheet_id: client.article_sheet_id, article_sheet_tab: client.article_sheet_tab }),
    });
    setSaving(false); onSaved();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">貼上 Google Sheet 網址</label>
        <input value={url} onChange={e => setUrl(e.target.value)} onBlur={handleUrlBlur}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
        {resolving && <p className="text-xs text-gray-400">解析中…</p>}
        {resolveError && <p className="text-xs text-red-500">{resolveError}</p>}
      </div>
      {(sheetId || sheetTab) && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 space-y-0.5">
          <p className="text-xs text-gray-500">Sheet ID：<span className="font-mono text-gray-700">{sheetId || '-'}</span></p>
          <p className="text-xs text-gray-500">分頁：<span className="font-medium text-gray-700">{sheetTab || '-'}</span></p>
        </div>
      )}
      <button onClick={save} disabled={saving || !sheetId || !sheetTab}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? '儲存中…' : '儲存設定'}
      </button>
    </div>
  );
}

function ArticleSheetEditor({ client, onSaved }: { client: GscClient; onSaved: () => void }) {
  const [url, setUrl] = useState(client.article_sheet_id ? `https://docs.google.com/spreadsheets/d/${client.article_sheet_id}` : '');
  const [sheetId, setSheetId] = useState(client.article_sheet_id);
  const [sheetTab, setSheetTab] = useState(client.article_sheet_tab);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleUrlBlur() {
    const parsed = parseSheetUrl(url);
    if (!parsed) return;
    setResolving(true); setResolveError('');
    try {
      const res = await fetch(`/api/gsc/sheet-meta?sheetId=${parsed.sheetId}&gid=${parsed.gid}`);
      const data = await res.json() as { tab?: string; error?: string };
      if (!res.ok) { setResolveError(data.error ?? '無法讀取'); return; }
      setSheetId(parsed.sheetId);
      if (data.tab) setSheetTab(data.tab);
    } finally { setResolving(false); }
  }

  async function save() {
    setSaving(true);
    await fetch('/api/gsc/clients', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, name: client.name, site_url: client.site_url, sheet_id: client.sheet_id, sheet_tab: client.sheet_tab, auto_update: client.auto_update === 1, article_sheet_id: sheetId, article_sheet_tab: sheetTab }),
    });
    setSaving(false); onSaved();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">貼上文章 Sheet 網址</label>
        <input value={url} onChange={e => setUrl(e.target.value)} onBlur={handleUrlBlur}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
        {resolving && <p className="text-xs text-gray-400">解析中…</p>}
        {resolveError && <p className="text-xs text-red-500">{resolveError}</p>}
      </div>
      {(sheetId || sheetTab) && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 space-y-0.5">
          <p className="text-xs text-gray-500">Sheet ID：<span className="font-mono text-gray-700">{sheetId || '-'}</span></p>
          <p className="text-xs text-gray-500">分頁：<span className="font-medium text-gray-700">{sheetTab || '-'}</span></p>
        </div>
      )}
      <button onClick={save} disabled={saving || !sheetId || !sheetTab}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? '儲存中…' : '儲存設定'}
      </button>
    </div>
  );
}

function KeywordEditor({ client, onSaved }: { client: GscClient; onSaved: () => void }) {
  const [raw, setRaw] = useState(() => client.keywords.map(k => `${k.label ? k.label + '  ' : ''}${k.keyword}`).join('\n'));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const keywords = raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      if (line.includes('\t')) {
        const [first, ...rest] = line.split('\t');
        const second = rest.join('\t').trim();
        if (first.trim().length <= 4) return { keyword: second, label: first.trim() };
        return { keyword: first.trim(), label: second };
      }
      const spaceParts = line.split(/\s{2,}/);
      if (spaceParts.length >= 2) {
        const first = spaceParts[0].trim(); const second = spaceParts.slice(1).join(' ').trim();
        if (first.length <= 4) return { keyword: second, label: first };
        return { keyword: first, label: second };
      }
      return { keyword: line, label: '' };
    });
    await fetch('/api/gsc/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id, keywords }) });
    setSaving(false); onSaved();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">每行一個關鍵字，備註可寫在前或後</p>
      <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={10}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y" />
      <button onClick={save} disabled={saving}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? '儲存中…' : '儲存關鍵字'}
      </button>
    </div>
  );
}

function ArticleEditor({ client, onSaved }: { client: GscClient; onSaved: () => void }) {
  const [raw, setRaw] = useState(() =>
    client.article_pages.map(p => `${p.title}\t${p.url}`).join('\n')
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const article_pages = raw.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split('\t');
      if (parts.length >= 2) return { type: '', title: parts[0].trim(), url: parts[1].trim() };
      return { type: '', title: '', url: parts[0].trim() };
    }).filter(p => p.url);
    await fetch('/api/gsc/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id, article_pages }) });
    setSaving(false); onSaved();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">從 Sheet 複製「文章標題、原文章連結」兩欄貼入，每行一筆</p>
      <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={10}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y"
        placeholder={"外泌體護膚是什麼？...\thttps://example.com/article/1"} />
      <button onClick={save} disabled={saving}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? '儲存中…' : '儲存文章清單'}
      </button>
    </div>
  );
}

const SCRIPT_ID = '1Asmg4idMPyeie79dNOIvhTvduUh87T3ZY6yocxzA8xF7A155j5zuyoI6';
const SCRIPT_FN = `function GETLINK(cell) {\n  return seo.GETURL_LIB(cell);\n}`;

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} title="複製" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-800 transition-colors shrink-0">
      {copied
        ? <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      {label && <span>{copied ? '已複製' : label}</span>}
    </button>
  );
}

function ScriptTip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs space-y-2 w-56">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 w-full text-left font-medium text-amber-800">
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707M6.343 17.657l-.707.707M15.536 8.464A5 5 0 1 1 8.464 15.536M12 17v-2a3 3 0 0 0-3-3H7"/></svg>
        如何自動抓超連結網址？
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && (
        <div className="space-y-3 text-amber-900 leading-relaxed pt-1 border-t border-amber-200">
          <p>若「原文章連結」欄是超連結文字，需先用腳本取出純網址。</p>
          <div className="space-y-1">
            <p className="font-semibold">第一步：在新表格引用程式庫</p>
            <p>擴充功能 → Apps Script → 資料庫 + → 貼入腳本 ID，ID 填入 <code className="bg-amber-100 px-1 rounded">seo</code>，接著新增下方函式後按上方儲存圖示保存：</p>
            <CopyBtn text={SCRIPT_ID} label="複製腳本 ID" />
            <CopyBtn text={SCRIPT_FN} label="複製函式" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">第二步：在表格輸入公式</p>
            <CopyBtn text={`=MAP(G2:G, I2:I, LAMBDA(check, link_cell, IF(AND(check=TRUE, link_cell<>""), GETLINK(CELL("address", link_cell)), "")))`} label="複製公式" />
            <p>把回傳的純網址填入「原文章連結」欄，本工具即可正確查詢排名。</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GscClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<GscClient | null>(null);
  // 左側狀態
  const [showKeywordEditor, setShowKeywordEditor] = useState(false);
  const [showSheetEditor, setShowSheetEditor] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSiteUrl, setEditSiteUrl] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [sheetWriting, setSheetWriting] = useState(false);
  const [sheetResult, setSheetResult] = useState<{ updated: number; notFound: string[] } | null>(null);
  const [sheetError, setSheetError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 右側狀態
  const [showArticleEditor, setShowArticleEditor] = useState(false);
  const [showArticleSheetEditor, setShowArticleSheetEditor] = useState(false);
  const [articleEndDate, setArticleEndDate] = useState(defaultEndDate);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleResults, setArticleResults] = useState<ArticleRankResult[] | null>(null);
  const [articleError, setArticleError] = useState('');
  const [articleSheetWriting, setArticleSheetWriting] = useState(false);
  const [articleSheetResult, setArticleSheetResult] = useState<{ updated: number; notFound: string[] } | null>(null);
  const [articleSheetError, setArticleSheetError] = useState('');

  function loadClient() {
    fetch('/api/gsc/clients').then(r => r.json()).then((list: GscClient[]) => {
      const found = list.find(c => String(c.id) === id);
      setClient(found ?? null);
      if (found && !found.article_sheet_id) setShowArticleSheetEditor(true);
    });
  }

  useEffect(() => { loadClient(); }, [id]);
  async function deleteClient() {
    if (!client || !confirm('確定刪除此客戶？')) return;
    await fetch('/api/gsc/clients', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id }) });
    router.push('/gsc');
  }

  async function handleQuery() {
    if (!client) return;
    const keywords = client.keywords.map(k => k.keyword);
    if (!keywords.length) { setError('請先設定關鍵字'); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(''); setQueryResult(null);
    try {
      const res = await fetch('/api/gsc/rank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: client.site_url, keywords, endDate }),
        signal: abortRef.current.signal,
      });
      const data = await res.json() as QueryResult & { error?: string };
      if (!res.ok) setError(data.error ?? '查詢失敗');
      else setQueryResult(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e));
    } finally { setLoading(false); }
  }

  async function handleWriteSheet() {
    if (!client || !queryResult) return;
    setSheetWriting(true); setSheetResult(null); setSheetError('');
    try {
      const res = await fetch('/api/gsc/sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, results: queryResult.results }),
      });
      const data = await res.json() as { updated?: number; notFound?: string[]; error?: string };
      if (!res.ok) setSheetError(data.error ?? '寫入失敗');
      else setSheetResult({ updated: data.updated ?? 0, notFound: data.notFound ?? [] });
    } catch (e) { setSheetError(String(e)); }
    finally { setSheetWriting(false); }
  }

  async function handleArticleQuery() {
    if (!client || !client.article_pages.length) { setArticleError('請先設定文章清單'); return; }
    setArticleLoading(true); setArticleError(''); setArticleResults(null);
    try {
      const res = await fetch('/api/gsc/article-rank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, pages: client.article_pages, endDate: articleEndDate }),
      });
      const data = await res.json() as { results?: ArticleRankResult[]; error?: string };
      if (!res.ok) setArticleError(data.error ?? '查詢失敗');
      else setArticleResults(data.results ?? []);
    } catch (e) { setArticleError(String(e)); }
    finally { setArticleLoading(false); }
  }

  async function handleArticleWriteSheet() {
    if (!client || !articleResults) return;
    setArticleSheetWriting(true); setArticleSheetResult(null); setArticleSheetError('');
    try {
      const res = await fetch('/api/gsc/article-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, results: articleResults.map(r => ({ title: r.title, position: r.position })) }),
      });
      const data = await res.json() as { updated?: number; notFound?: string[]; error?: string };
      if (!res.ok) setArticleSheetError(data.error ?? '寫入失敗');
      else setArticleSheetResult({ updated: data.updated ?? 0, notFound: data.notFound ?? [] });
    } catch (e) { setArticleSheetError(String(e)); }
    finally { setArticleSheetWriting(false); }
  }

  if (!client) return <div className="p-8 text-sm text-gray-400">載入中…</div>;

  const labelGroups = queryResult
    ? [...new Set(queryResult.results.map(r => client.keywords.find(k => k.keyword === r.keyword)?.label ?? ''))]
    : [];

  return (
    <div className="p-8 space-y-5 max-w-7xl">
      {/* 返回 */}
      <button onClick={() => router.push('/gsc')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        返回
      </button>

      {/* 客戶資訊 */}
      {editingInfo ? (
        <div className="space-y-2 max-w-md">
          <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <input value={editSiteUrl} onChange={e => setEditSiteUrl(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <div className="flex gap-2">
            <button onClick={async () => { setSavingInfo(true); await fetch('/api/gsc/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id, name: editName, site_url: editSiteUrl, sheet_id: client.sheet_id, sheet_tab: client.sheet_tab, auto_update: client.auto_update === 1, article_sheet_id: client.article_sheet_id, article_sheet_tab: client.article_sheet_tab }) }); setSavingInfo(false); setEditingInfo(false); loadClient(); }} disabled={savingInfo} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">{savingInfo ? '儲存中…' : '儲存'}</button>
            <button onClick={() => setEditingInfo(false)} className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
            <button onClick={() => { setEditName(client.name); setEditSiteUrl(client.site_url); setEditingInfo(true); }} className="text-xs text-gray-400 hover:text-gray-700">編輯</button>
            <button onClick={deleteClient} className="text-xs text-red-400 hover:text-red-600">刪除</button>
            <button onClick={async () => {
              const next = client.auto_update === 1 ? 0 : 1;
              await fetch('/api/gsc/clients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id, name: client.name, site_url: client.site_url, sheet_id: client.sheet_id, sheet_tab: client.sheet_tab, auto_update: next === 1, article_sheet_id: client.article_sheet_id, article_sheet_tab: client.article_sheet_tab }) });
              loadClient();
            }} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <div className={`relative w-7 h-4 rounded-full transition-colors ${client.auto_update === 1 ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${client.auto_update === 1 ? 'translate-x-3' : ''}`} />
              </div>
              <span>每週一 10:00 自動更新</span>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{client.site_url}</p>
        </div>
      )}

      {/* 左右兩欄 + 便利貼 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_auto] gap-8">

        {/* ── 左側：關鍵字排名 ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">關鍵字排名</h2>

          <button onClick={() => setShowKeywordEditor(v => !v)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>
            {showKeywordEditor ? '收起關鍵字' : `追蹤關鍵字（${client.keywords.length} 個）`}
          </button>
          {showKeywordEditor && <KeywordEditor key={client.id} client={client} onSaved={() => { loadClient(); setShowKeywordEditor(false); }} />}

          {!showKeywordEditor && (
            <button onClick={() => setShowSheetEditor(v => !v)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7"/></svg>
              {showSheetEditor ? '收起 Sheet 設定' : `Sheet 設定${client.sheet_id ? '（已設定）' : '（未設定）'}`}
            </button>
          )}
          {showSheetEditor && !showKeywordEditor && <SheetEditor key={client.id} client={client} onSaved={() => { loadClient(); setShowSheetEditor(false); }} />}

          {!showKeywordEditor && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">抓取日期</label>
                <input type="date" value={endDate} max={defaultEndDate()} onChange={e => setEndDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
                <p className="text-xs text-gray-400">往前 90 天平均排名</p>
              </div>
              <button onClick={handleQuery} disabled={loading || !endDate || !client.keywords.length || !client.sheet_id || !client.sheet_tab}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {loading ? '查詢中…' : '查詢排名'}
              </button>
              {(!client.sheet_id || !client.sheet_tab) && <p className="text-xs text-amber-600">請先設定 Sheet 才能查詢</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          {queryResult && !showKeywordEditor && (
            <div className="space-y-3">
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
                      <th className="px-3 py-2 text-center">上週</th>
                      <th className="px-3 py-2 text-center">本週</th>
                      <th className="px-3 py-2 text-center">變化</th>
                      <th className="px-3 py-2 text-center">點擊</th>
                      <th className="px-3 py-2 text-center">曝光</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {labelGroups.map(label =>
                      queryResult.results.filter(r => (client.keywords.find(k => k.keyword === r.keyword)?.label ?? '') === label).map(r => {
                        const kwMeta = client.keywords.find(k => k.keyword === r.keyword);
                        return (
                          <tr key={r.keyword} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{r.keyword}</td>
                            <td className="px-3 py-2">{kwMeta?.label && <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">{kwMeta.label}</span>}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{r.a.found ? `#${r.a.position}` : '-'}</td>
                            <td className="px-3 py-2 text-center font-semibold text-gray-800">{r.b.found ? `#${r.b.position}` : '-'}</td>
                            <TrendCell a={r.a} b={r.b} />
                            <td className="px-3 py-2 text-center text-gray-600">{r.b.found ? r.b.clicks?.toLocaleString() : '-'}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{r.b.found ? r.b.impressions?.toLocaleString() : '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {client.sheet_id && client.sheet_tab && (
                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={handleWriteSheet} disabled={sheetWriting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7"/></svg>
                    {sheetWriting ? '寫入中…' : '寫入 Sheet'}
                  </button>
                  {sheetResult && <span className="text-sm text-emerald-700">成功更新 {sheetResult.updated} 個欄位{sheetResult.notFound.length > 0 && <span className="text-gray-400 ml-2">（找不到：{sheetResult.notFound.join('、')}）</span>}</span>}
                  {sheetError && <span className="text-sm text-red-600">{sheetError}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 右側：文章排名 ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">文章排名報告</h2>

          <button onClick={() => setShowArticleEditor(v => !v)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z"/></svg>
            {showArticleEditor ? '收起文章清單' : `文章清單（${client.article_pages.length} 篇）`}
          </button>
          {showArticleEditor && <ArticleEditor key={client.id} client={client} onSaved={() => { loadClient(); setShowArticleEditor(false); }} />}

          {!showArticleEditor && (
            <button onClick={() => setShowArticleSheetEditor(v => !v)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7"/></svg>
              {showArticleSheetEditor ? '收起文章 Sheet 設定' : `文章 Sheet${client.article_sheet_id ? '（已設定）' : '（未設定）'}`}
            </button>
          )}
          {showArticleSheetEditor && !showArticleEditor && <ArticleSheetEditor key={client.id} client={client} onSaved={() => { loadClient(); setShowArticleSheetEditor(false); }} />}

          {!showArticleEditor && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">抓取日期</label>
                <input type="date" value={articleEndDate} max={defaultEndDate()} onChange={e => setArticleEndDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
              </div>
              <button onClick={handleArticleQuery} disabled={articleLoading || !client.article_pages.length || !client.article_sheet_id}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {articleLoading ? '查詢中…' : '查詢文章排名'}
              </button>
              {!client.article_sheet_id && <p className="text-xs text-amber-600">請先設定文章 Sheet</p>}
              {articleError && <p className="text-sm text-red-600">{articleError}</p>}
            </div>
          )}

          {articleResults && !showArticleEditor && (
            <div className="space-y-3">
              {articleResults.every(r => r.position === null) && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold">所有文章排名皆為空</p>
                  <p>GSC 使用完全比對，請確認下方 URL 格式與 GSC Search Console 裡顯示的網址一致（http/https、www、結尾斜線都要相符）。</p>
                </div>
              )}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 font-medium">
                      <th className="px-3 py-2 text-left w-[60%]">文章標題</th>
                      <th className="px-3 py-2 text-left w-[30%]">查詢 URL</th>
                      <th className="px-3 py-2 text-center w-[10%]">排名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {articleResults.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 text-xs">{r.title}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs font-mono overflow-hidden">
                          <ExpandableUrl url={r.url} />
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-800">{r.position !== null ? `#${r.position}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {client.article_sheet_id && client.article_sheet_tab && (
                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={handleArticleWriteSheet} disabled={articleSheetWriting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10m0-10a2 2 0 012 2h2a2 2 0 012-2V7"/></svg>
                    {articleSheetWriting ? '寫入中…' : '寫入 Sheet'}
                  </button>
                  {articleSheetResult && <span className="text-sm text-emerald-700">成功更新 {articleSheetResult.updated} 筆{articleSheetResult.notFound.length > 0 && <span className="text-gray-400 ml-2">（找不到：{articleSheetResult.notFound.length} 筆）</span>}</span>}
                  {articleSheetError && <span className="text-sm text-red-600">{articleSheetError}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 第三欄：便利貼 ── */}
        <div>
          <ScriptTip />
        </div>

      </div>
    </div>
  );
}

function ExpandableUrl({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <span
      onClick={() => setExpanded(v => !v)}
      className={`cursor-pointer hover:text-gray-600 transition-colors ${expanded ? 'break-all' : 'truncate block'}`}
      title={expanded ? '點擊收起' : '點擊展開'}
    >
      {expanded ? url : url}
    </span>
  );
}
