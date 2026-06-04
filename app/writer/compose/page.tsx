'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

// ── Types ─────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string };
type SearchResult = { title: string; url: string; content: string };
type Stage = 'analyze' | 'outline' | 'write';

type Section = {
  id: string;
  h2: string;
  h3s: string[];
  content: string;
  generating: boolean;
  editing: boolean;
};

// ── Prompts ───────────────────────────────────────────────────────────

function buildAnalyzePrompt(keyword: string, brandName: string, brandUrl: string, refs: SearchResult[]) {
  const refBlock = refs.length > 0
    ? `以下是搜尋「${keyword}」取得的競品參考資料，請在分析時參考這些頁面：\n\n${refs.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content.slice(0, 300)}`).join('\n\n')}\n\n---\n\n`
    : '';
  return `${refBlock}你的任務是根據我提供的關鍵字、品牌名稱、品牌網址或參考資料，協助我產出可直接上稿的繁體中文 SEO 文章。

文章定位是「搜尋意圖導向的資訊整理型 SEO 文章」，不是部落格心得文、學術論文或品牌業配文。

內容應以清楚、實用、可掃讀為優先；H2 / H3 目錄必須維持資訊整理型 SEO 標題。

請整理成 SEO 寫作控制表，內容包含：
1. 搜尋意圖：搜尋者是誰、核心需求、決策階段、主要疑慮。
2. 競品觀察：常見架構、內容形式、競品缺口。
3. 品牌服務確認：哪些可安全描述、哪些不能貿然宣稱。
4. 文章策略：建議切入角度、需要加強的內容、應避免的寫法。
5. 標題提案：提供 5 個 SEO 標題，並簡短說明各自適合的搜尋意圖。

品牌內容必須保守，不得捏造服務、成果、案例、數據或保證。

關鍵字：${keyword}
品牌名稱：${brandName.trim() || '（未提供）'}
品牌網址：${brandUrl.trim() || '（未提供）'}

請進行 SEO 寫作控制表與標題提案。`;
}

function buildOutlinePrompt(title: string) {
  return `我選擇：${title}

請根據這個標題建立 SEO 文章架構，目錄只列到 H3，不列 H4。

標準：
- H2 / H3 必須是資訊整理型 SEO 標題，不要過度口語化或故事化。
- 段落順序需符合搜尋意圖與讀者決策流程。
- 保留 FAQ、文章總結與品牌介紹段落（若品牌資訊不足則刪除品牌段落）。
- 次要主題可下放為 H3，不要全部拆成 H2。

只輸出架構，格式為 ## H2 和 ### H3，不要加其他說明文字。`;
}

function buildWriteSectionPrompt(sec: Section, outlineText: string) {
  const h3s = sec.h3s.length > 0 ? `（包含其下 H3：${sec.h3s.join('、')}）` : '';
  return `完整文章架構如下：\n${outlineText}\n\n現在請只撰寫「${sec.h2}」這個段落${h3s}的正文內容。

撰寫規則：
- 內容必須可直接複製上稿，不要附分析說明或額外註解。
- 每一句都必須提供新資訊、判斷或實用建議，刪除沒有資訊量的句子。
- 若有適合加入文獻、法規、研究的地方，請自然融入並附來源連結。
- 版面自行判斷：概念用段落；優缺點用項目符號；步驟用編號；比較用表格。
- 使用台灣繁體中文，風格清楚、實用、可掃讀。

從 ## 標題開始輸出，只輸出該段落正文。`;
}

function buildProofreadPrompt(article: string) {
  return `以下是 SEO 文章草稿，請以「校稿編輯」角色條列修改建議（不要直接改稿）：\n\n${article}\n\n請從以下角度審查，每條建議標明段落位置：\n1. 資訊正確性\n2. 段落邏輯\n3. 低資訊句\n4. 語氣問題\n5. SEO 標題品質\n6. 品牌描述`;
}

// ── Parsers ───────────────────────────────────────────────────────────

function parseTitles(text: string): string[] {
  const lines = text.split('\n');
  const titles: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const t = line.trim();
    if (/標題提案|標題建議/.test(t)) { inSection = true; continue; }
    if (inSection && /^#{1,3}\s/.test(t) && !/標題/.test(t)) break;
    if (inSection) {
      const m = t.match(/^\d+[.、)]\s*(.+)/);
      if (m) {
        const title = m[1].replace(/\*\*/g, '').replace(/\s*[—–]\s*.+$/, '').trim();
        if (title.length > 3) titles.push(title);
      }
    }
  }
  return titles;
}

function parseOutline(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const line of text.split('\n')) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h2) {
      if (cur) sections.push(cur);
      cur = { id: Math.random().toString(36).slice(2), h2: h2[1].trim(), h3s: [], content: '', generating: false, editing: false };
    } else if (h3 && cur) {
      cur.h3s.push(h3[1].trim());
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

// ── Stream ────────────────────────────────────────────────────────────

async function streamAPI(messages: Message[], onChunk: (t: string) => void) {
  const res = await fetch('/api/writer/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const j = await res.json() as { error?: string };
    throw new Error(j.error ?? '呼叫 API 失敗');
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try { const t = JSON.parse(data).choices?.[0]?.delta?.content ?? ''; if (t) onChunk(t); } catch { /* skip */ }
    }
  }
}

// ── UI primitives ─────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function Err({ msg }: { msg: string }) {
  return <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{msg}</div>;
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function MdView({ content }: { content: string }) {
  return (
    <div className="text-sm text-gray-800 leading-relaxed">
      <ReactMarkdown components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-4 mb-1 pb-1 border-b border-gray-200">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-0.5">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 space-y-0.5 mb-2 text-sm text-gray-700">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-0.5 mb-2 text-sm text-gray-700">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-gray-700 leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse border border-gray-200">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
        th: ({ children }) => <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-700">{children}</th>,
        td: ({ children }) => <td className="border border-gray-200 px-3 py-1.5 text-gray-600">{children}</td>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-500 my-2">{children}</blockquote>,
      }}>{content}</ReactMarkdown>
    </div>
  );
}

function AutoTA({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight + 2}px`; }
  }, [value]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} className={`resize-none overflow-hidden w-full ${className ?? ''}`} />;
}

// Stepper
function Stepper({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: 'analyze', label: 'SEO 分析' },
    { key: 'outline', label: '文章架構' },
    { key: 'write', label: '段落撰寫' },
  ];
  const idx = steps.findIndex(s => s.key === stage);
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${i < idx ? 'bg-emerald-500 text-white' : i === idx ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {i < idx ? '✓' : i + 1}
            </span>
            <span className={`text-sm font-medium transition-colors ${i === idx ? 'text-gray-900' : i < idx ? 'text-emerald-600' : 'text-gray-400'}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`w-8 h-px mx-2 ${i < idx ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  );
}

// Title selector
function TitleSelector({ titles, value, onChange }: { titles: string[]; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isCustom = value !== '' && !titles.includes(value);

  function startEdit() { setDraft(value); setEditing(true); }
  function commit() { if (draft.trim()) onChange(draft.trim()); setEditing(false); }

  return (
    <div className="space-y-2">
      {titles.length > 0 && !editing && (
        <div className="flex gap-2">
          <select className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
            value={isCustom ? '__custom__' : value}
            onChange={e => e.target.value === '__custom__' ? startEdit() : onChange(e.target.value)}>
            <option value="">── 請選擇標題 ──</option>
            {titles.map((t, i) => <option key={i} value={t}>{t}</option>)}
            <option value="__custom__">✏️ 自訂標題…</option>
          </select>
          {value && !isCustom && (
            <button onClick={startEdit} className="flex items-center gap-1 px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"><EditIcon />編輯</button>
          )}
        </div>
      )}
      {(editing || titles.length === 0 || isCustom) && (
        <div className="flex gap-2">
          <input autoFocus={editing} className="flex-1 px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={editing ? draft : value} onChange={e => editing ? setDraft(e.target.value) : onChange(e.target.value)}
            placeholder="輸入或貼上 SEO 標題…"
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
          {editing && <>
            <button onClick={commit} className="px-3 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">確認</button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">取消</button>
          </>}
        </div>
      )}
    </div>
  );
}

// ── Stage 1 ───────────────────────────────────────────────────────────

function Stage1({ keyword, vendor, onDone }: {
  keyword: string; vendor: string;
  onDone: (analyzeMsg: string, analysisResult: string, title: string) => void;
}) {
  const [brandName, setBrandName] = useState(vendor);
  const [brandUrl, setBrandUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [editingResult, setEditingResult] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const analyzeMsg = useRef('');

  async function run() {
    setResult(''); setError(''); setTitles([]); setSelectedTitle(''); setEditingResult(false);
    setSearchResults([]);

    setSearching(true);
    let refs: SearchResult[] = [];
    try {
      const r = await fetch(`/api/writer/search?keyword=${encodeURIComponent(keyword)}`);
      if (r.ok) { refs = ((await r.json()) as { results?: SearchResult[] }).results ?? []; setSearchResults(refs); }
    } catch { /* 不阻斷 */ } finally { setSearching(false); }

    const msg = buildAnalyzePrompt(keyword, brandName, brandUrl, refs);
    analyzeMsg.current = msg;
    setAnalyzing(true);
    try {
      let full = '';
      await streamAPI([{ role: 'user', content: msg }], chunk => { full += chunk; setResult(r => r + chunk); });
      setTitles(parseTitles(full));
    } catch (e) { setError(e instanceof Error ? e.message : '分析失敗'); }
    finally { setAnalyzing(false); }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">關鍵字</label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">{keyword || '—'}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">品牌名稱</label>
          <input className={inputCls} value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="例：ABC 公司（可留空）" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">品牌網址</label>
        <input className={inputCls} value={brandUrl} onChange={e => setBrandUrl(e.target.value)} placeholder="https://（可留空）" />
      </div>
      <button onClick={run} disabled={searching || analyzing || !keyword.trim()}
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50">
        {(searching || analyzing) && <Spinner />}
        {searching ? '搜尋競品資料中…' : analyzing ? '分析中…' : '開始 SEO 分析'}
      </button>

      {error && <Err msg={error} />}

      {searchResults.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Tavily 競品參考連結
          </p>
          <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
            {searchResults.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-2.5 hover:bg-blue-50/50 transition-colors group">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 group-hover:bg-blue-100 text-gray-500 text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-blue-600 group-hover:underline truncate font-medium">{r.title}</p>
                  <p className="text-xs text-gray-400 truncate">{r.url}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            ))}
          </div>
        </div>
      )}

      {(result || analyzing) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">分析結果</label>
            {result && !analyzing && (
              <button onClick={() => setEditingResult(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                <EditIcon />{editingResult ? '完成編輯' : '編輯'}
              </button>
            )}
          </div>
          {analyzing && !result
            ? <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Spinner /> 分析中…</div>
            : editingResult
              ? <AutoTA value={result} onChange={setResult} className="px-3 py-2 border border-blue-300 rounded-xl text-sm font-mono bg-white min-h-[200px] focus:outline-none focus:ring-2 focus:ring-blue-200" />
              : <div className="px-4 py-3 border border-gray-100 rounded-xl bg-white"><MdView content={result} /></div>
          }
        </div>
      )}

      {result && !analyzing && (
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <label className="block text-sm font-semibold text-gray-800">選擇 SEO 標題</label>
          <TitleSelector titles={titles} value={selectedTitle} onChange={setSelectedTitle} />
          {selectedTitle && (
            <button onClick={() => onDone(analyzeMsg.current, result, selectedTitle)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors">
              確認標題，進入架構規劃 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stage 2 ───────────────────────────────────────────────────────────

function Stage2({ title, analyzeMsg, analysisResult, onBack, onDone }: {
  title: string; analyzeMsg: string; analysisResult: string;
  onBack: () => void;
  onDone: (outlineMsg: string, outlineResult: string, sections: Section[]) => void;
}) {
  const [outlining, setOutlining] = useState(false);
  const [outline, setOutline] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const outlineMsg = useRef('');

  useEffect(() => { run(); }, []); // 自動開始

  async function run() {
    const msg = buildOutlinePrompt(title);
    outlineMsg.current = msg;
    setOutline(''); setError(''); setEditing(false); setOutlining(true);
    try {
      await streamAPI([
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: msg },
      ], chunk => setOutline(r => r + chunk));
    } catch (e) { setError(e instanceof Error ? e.message : '產生架構失敗'); }
    finally { setOutlining(false); }
  }

  function confirm() {
    const sections = parseOutline(outline);
    if (sections.length === 0) return;
    onDone(outlineMsg.current, outline, sections);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">選定標題</p>
          <p className="text-base font-semibold text-gray-900">{title}</p>
        </div>
        <button onClick={run} disabled={outlining} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          {outlining && <Spinner />}重新產生
        </button>
      </div>

      {error && <Err msg={error} />}

      {outlining && !outline && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8"><Spinner /> 產生架構中…</div>
      )}

      {(outline || outlining) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">文章架構</label>
            {outline && !outlining && (
              <button onClick={() => setEditing(v => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700">
                <EditIcon />{editing ? '完成編輯' : '編輯'}
              </button>
            )}
          </div>
          {editing
            ? <AutoTA value={outline} onChange={setOutline} className="px-3 py-2 border border-blue-300 rounded-xl text-sm font-mono bg-white min-h-[180px] focus:outline-none focus:ring-2 focus:ring-blue-200" />
            : outline
              ? <div className="px-4 py-3 border border-gray-100 rounded-xl bg-white"><MdView content={outline} /></div>
              : null
          }
        </div>
      )}

      {outline && !outlining && (
        <div className="flex items-center gap-3">
          <button onClick={confirm}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors">
            確認架構，開始撰寫 →
          </button>
          <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700">← 返回修改標題</button>
        </div>
      )}
    </div>
  );
}

// ── Stage 3 ───────────────────────────────────────────────────────────

function Stage3({ title, keyword, analyzeMsg, analysisResult, outlineMsg, outlineResult, initSections, onBack }: {
  title: string; keyword: string;
  analyzeMsg: string; analysisResult: string;
  outlineMsg: string; outlineResult: string;
  initSections: Section[];
  onBack: () => void;
}) {
  const [sections, setSections] = useState<Section[]>(initSections);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [proofread, setProofread] = useState('');
  const [proofreading, setProofreading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const outlineText = sections.map(s => `## ${s.h2}` + (s.h3s.length ? '\n' + s.h3s.map(h => `### ${h}`).join('\n') : '')).join('\n\n');
  const fullArticle = sections.filter(s => s.content.trim()).map(s => s.content.trim()).join('\n\n');
  const doneCount = sections.filter(s => s.content.trim()).length;
  const anyGenerating = sections.some(s => s.generating);

  async function generateSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    setSections(prev => prev.map(s => s.id === id ? { ...s, generating: true, content: '', editing: false } : s));
    setErrors(prev => ({ ...prev, [id]: '' }));
    try {
      await streamAPI([
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: outlineMsg },
        { role: 'assistant', content: outlineResult },
        { role: 'user', content: buildWriteSectionPrompt(sec, outlineText) },
      ], chunk => setSections(prev => prev.map(s => s.id === id ? { ...s, content: s.content + chunk } : s)));
    } catch (e) { setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : '產生失敗' })); }
    finally { setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false } : s)); }
  }

  async function generateAll() {
    await Promise.all(sections.filter(s => !s.content.trim() && !s.generating).map(s => generateSection(s.id)));
  }

  async function runProofread() {
    if (!fullArticle.trim()) return;
    setProofread(''); setProofError(''); setProofreading(true);
    try {
      await streamAPI([{ role: 'user', content: buildProofreadPrompt(fullArticle) }],
        chunk => setProofread(r => r + chunk));
    } catch (e) { setProofError(e instanceof Error ? e.message : '校稿失敗'); }
    finally { setProofreading(false); }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-400">{keyword} · {doneCount}/{sections.length} 段完成</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(v => !v)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${showPreview ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {showPreview ? '隱藏預覽' : '全文預覽'}
          </button>
          {fullArticle && (
            <button onClick={() => navigator.clipboard.writeText(fullArticle)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              複製全文
            </button>
          )}
          {fullArticle && (
            <button onClick={runProofread} disabled={proofreading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {proofreading && <Spinner />}{proofreading ? '校稿中…' : '校稿'}
            </button>
          )}
          <button onClick={generateAll} disabled={anyGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
            {anyGenerating && <Spinner />}全部產生
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-4">

          {/* Section cards */}
          {sections.map(sec => (
            <div key={sec.id} className={`border rounded-2xl overflow-hidden ${sec.content.trim() ? 'border-emerald-200' : 'border-gray-200'}`}>
              <div className={`flex items-start justify-between gap-4 px-5 py-3.5 ${sec.content.trim() ? 'bg-emerald-50/50' : 'bg-gray-50/50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{sec.h2}</p>
                  {sec.h3s.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">{sec.h3s.map(h => `↳ ${h}`).join('   ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sec.content.trim() && !sec.generating && (
                    <button onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, editing: !s.editing } : s))}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-white text-gray-600">
                      <EditIcon />{sec.editing ? '完成' : '編輯'}
                    </button>
                  )}
                  <button onClick={() => generateSection(sec.id)} disabled={sec.generating}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${sec.content.trim() ? 'border border-gray-300 text-gray-600 hover:bg-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                    {sec.generating && <Spinner />}
                    {sec.generating ? '撰寫中…' : sec.content.trim() ? '重新產生' : '產生段落'}
                  </button>
                </div>
              </div>

              {errors[sec.id] && <div className="px-5 py-3"><Err msg={errors[sec.id]} /></div>}

              {(sec.content.trim() || sec.generating) && (
                <div className="px-5 py-4">
                  {sec.generating || sec.editing
                    ? <AutoTA value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        placeholder="撰寫中…"
                        className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[140px] focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    : <div className="px-4 py-3 border border-gray-100 rounded-xl bg-white"><MdView content={sec.content} /></div>
                  }
                </div>
              )}
            </div>
          ))}

          {/* Proofread */}
          {(proofread || proofreading) && (
            <div className="border border-violet-200 rounded-2xl overflow-hidden">
              <div className="bg-violet-50/50 px-5 py-3.5">
                <p className="text-sm font-bold text-violet-800">校稿建議</p>
              </div>
              <div className="px-5 py-4">
                {proofreading && !proofread
                  ? <div className="flex items-center gap-2 text-sm text-gray-400"><Spinner /> 校稿中…</div>
                  : <div className="px-4 py-3 border border-gray-100 rounded-xl bg-white"><MdView content={proofread} /></div>
                }
                {proofError && <Err msg={proofError} />}
              </div>
            </div>
          )}

          {/* Full preview */}
          {showPreview && (
            <div className="border border-blue-200 rounded-2xl overflow-hidden">
              <div className="bg-blue-50/50 px-5 py-3.5 flex items-center justify-between">
                <p className="text-sm font-bold text-blue-800">全文預覽</p>
                <button onClick={() => navigator.clipboard.writeText(fullArticle)}
                  className="text-xs px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 text-blue-600">複製 Markdown</button>
              </div>
              <div className="px-5 py-4">
                {fullArticle
                  ? <div className="px-4 py-3 border border-gray-100 rounded-xl bg-white"><MdView content={fullArticle} /></div>
                  : <p className="text-sm text-gray-400 py-6 text-center">尚無已完成的段落</p>
                }
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

function ComposeInner() {
  const params = useSearchParams();
  const keyword = params.get('keyword') ?? '';
  const vendor = params.get('vendor') ?? '';

  const [stage, setStage] = useState<Stage>('analyze');

  // Cross-stage context
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [outlineMsg, setOutlineMsg] = useState('');
  const [outlineResult, setOutlineResult] = useState('');
  const [sections, setSections] = useState<Section[]>([]);

  const isWrite = stage === 'write';

  return (
    <div className={`flex flex-col ${isWrite ? 'h-screen' : 'min-h-screen'}`}>

      {/* Header */}
      <div className={`${isWrite ? 'hidden' : 'block'} border-b border-gray-100 bg-white`}>
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/writer" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </a>
          <div className="flex-1">
            <Stepper stage={stage} />
          </div>
          <p className="text-sm font-medium text-gray-600 truncate max-w-[180px]">{keyword}</p>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 ${isWrite ? 'overflow-hidden' : 'px-6 py-8'}`}>
        {stage === 'analyze' && (
          <Stage1
            keyword={keyword}
            vendor={vendor}
            onDone={(msg, result, title) => {
              setAnalyzeMsg(msg);
              setAnalysisResult(result);
              setSelectedTitle(title);
              setStage('outline');
            }}
          />
        )}
        {stage === 'outline' && (
          <Stage2
            title={selectedTitle}
            analyzeMsg={analyzeMsg}
            analysisResult={analysisResult}
            onBack={() => setStage('analyze')}
            onDone={(oMsg, oResult, secs) => {
              setOutlineMsg(oMsg);
              setOutlineResult(oResult);
              setSections(secs);
              setStage('write');
            }}
          />
        )}
        {stage === 'write' && (
          <Stage3
            title={selectedTitle}
            keyword={keyword}
            analyzeMsg={analyzeMsg}
            analysisResult={analysisResult}
            outlineMsg={outlineMsg}
            outlineResult={outlineResult}
            initSections={sections}
            onBack={() => setStage('outline')}
          />
        )}
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">載入中…</div>}>
      <ComposeInner />
    </Suspense>
  );
}
