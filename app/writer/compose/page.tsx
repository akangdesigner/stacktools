'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RichEditor from '@/components/writer/RichEditor';

// ── Types ─────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string };
type SearchResult = { title: string; url: string; content: string };
type Stage = 'analyze' | 'outline' | 'write';

type PromptStyle = 'info' | 'scene' | 'faq' | 'brand' | 'cta';

const STYLE_LABELS: Record<PromptStyle, string> = {
  info:  '資訊型',
  scene: '情境／開場',
  faq:   'FAQ 型',
  brand: '品牌介紹',
  cta:   '行動呼籲',
};

type RelatedLink = { text: string; url: string };

type Section = {
  id: string;
  h2: string;
  h3s: string[];
  content: string;
  generating: boolean;
  editing: boolean;
  promptStyle: PromptStyle;
  customPrompt: string;
  showPrompt: boolean;
  generateTable: boolean;
  relatedLinks: RelatedLink[];
  showRelatedLinks: boolean;
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
5. 標題提案：提供 5 個 SEO 標題，只列標題本身，不需要說明或大綱。

品牌內容必須保守，不得捏造服務、成果、案例、數據或保證。

關鍵字：${keyword}
品牌名稱：${brandName.trim() || '（未提供）'}
品牌網址：${brandUrl.trim() || '（未提供）'}

請進行 SEO 寫作控制表與標題提案。`;
}

function buildOutlinePrompt(title: string) {
  return `我選擇：${title}

請根據這個標題建立 SEO 文章架構，目錄只列到 H3，不列 H4。

必須包含的固定段落（依序）：
1. 前言（第一個 H2，作為文章導言，簡述內容與讀者收益）
2. 主要內容 H2 段落（依搜尋意圖與決策流程排列）
3. FAQ（常見問題，列 4–5 個 H3 問題）
4. 總結

其他標準：
- H2 / H3 必須是資訊整理型 SEO 標題，不要過度口語化或故事化。
- 次要主題下放為 H3，不要全部拆成 H2。
- 若有提供品牌資訊，可在總結前加入品牌介紹段落。

只輸出架構，格式為 ## H2 和 ### H3，不要加其他說明文字。`;
}

function buildSectionPromptByStyle(sec: Section, outlineText: string, style: PromptStyle): string {
  const h3s = sec.h3s.length > 0 ? `（包含其下 H3：${sec.h3s.join('、')}）` : '';
  const header = `完整文章架構如下：\n${outlineText}\n\n現在請只撰寫「${sec.h2}」這個段落${h3s}的正文內容。\n\n`;
  const footer = `\n\n從 ## 標題開始輸出，只輸出該段落正文，不要加任何說明或備註。`;

  if (style === 'scene') {
    return `${header}這個段落要用情境感帶入讀者，讓人一讀就有畫面、有共鳴。

寫法要求：以散文段落寫作，不要用條列符號。句子短、節奏輕快，用「你」直接和讀者說話。從一個具體的生活場景或感受切入，不說廢話，直接讓讀者感覺「這就是我」。語氣溫暖自然，不過度推銷，讓需求從情境裡自然浮現。繁體中文，台灣口語。${footer}`;
  }

  if (style === 'faq') {
    return `${header}這個段落以 Q&A 格式呈現常見問題與解答，預設列出 5 組問答。

寫法要求：每一題先用粗體寫出問題，問題語句要貼近讀者真正會搜尋的方式說話，然後用一到三句自然語句直接回答，不要再拆子條列。問題之間用空行分隔。不重複前面段落說過的內容。繁體中文，語氣直接親切。${footer}`;
  }

  if (style === 'brand') {
    return `${header}這個段落介紹品牌或服務，語氣要穩重誠實。

寫法要求：以散文段落寫作，只描述可被客觀確認的服務範圍或特色。絕對不捏造數據、案例、得獎記錄或任何保證效果的說法。可以自然帶出諮詢或了解更多的方向，但不強迫推銷。繁體中文，語氣專業但不冷漠。${footer}`;
  }

  if (style === 'cta') {
    return `${header}這個段落的任務是讓讀者願意採取下一步行動。

寫法要求：以散文段落寫作，不要用條列符號。先說清楚「現在行動的理由」，點出讀者的時機感或痛點，再自然帶出行動方向（如：了解更多、前往官網、立即諮詢）。語氣積極但不強迫，給讀者選擇感，不要讓人覺得被推銷。繁體中文，語氣真誠有溫度。${footer}`;
  }

  // 預設 info 風格
  return `${header}這個段落要提供清楚、實用的資訊，讓讀者讀完真的有收穫。

寫法要求：以散文段落寫作為主。若需要條列，格式必須是「**粗體名稱**：一句說明」，不要用普通的 - 條列符號。每一句都要有資訊量，刪掉廢話和沒意義的過場句。若有需要引用文獻、法規、研究數據，自然融入段落並附來源。繁體中文，風格清楚自然。${footer}`;
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
      // 支援：「1. 標題」「1、標題」「1) 標題」「- 標題」「* 標題」「• 標題」「標題 1：xxx」「**1. 標題**」
      const m = t.match(/^(?:標題\s*\d+\s*[：:]\s*|\d+[.、)]\s*|[-*•]\s+|\*\*\d+[.、)]\s*)(.+)/);
      if (m) {
        const title = m[1]
          .replace(/\*\*/g, '')                   // 移除 bold 符號
          .replace(/\s*[—–]\s*.+$/, '')            // 移除 em/en dash 後的說明
          .replace(/\s+-\s+.+$/, '')               // 移除「空格-空格」後的說明
          .replace(/\s*[（(][^）)]*[）)]\s*$/, '')  // 移除結尾括號說明
          .replace(/搜尋意圖[：:].+$/, '')           // 移除「搜尋意圖：...」尾綴
          .trim();
        if (title.length > 3) titles.push(title);
      }
    }
  }
  return titles;
}

function detectStyle(h2: string, index: number): PromptStyle {
  if (/FAQ|常見問題|Q&A/i.test(h2)) return 'faq';
  if (/品牌|關於|服務介紹|公司簡介/.test(h2)) return 'brand';
  if (/立即|馬上|如何選購|立刻|推薦|購買|選擇指南/.test(h2)) return 'cta';
  if (index === 0) return 'scene';
  return 'info';
}

function parseOutline(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const line of text.split('\n')) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    if (h2) {
      if (cur) sections.push(cur);
      const h2text = h2[1].trim();
      const idx = sections.length;
      cur = {
        id: Math.random().toString(36).slice(2),
        h2: h2text,
        h3s: [],
        content: '',
        generating: false,
        editing: false,
        promptStyle: detectStyle(h2text, idx),
        customPrompt: '',
        showPrompt: false,
        generateTable: /比較|差異|優缺點|選購指南|推薦/.test(h2text),
        relatedLinks: [],
        showRelatedLinks: false,
      };
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
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
  const fullArticle = sections.filter(s => s.content.trim()).map(s => {
    let text = s.content.trim();
    const links = s.relatedLinks.filter(l => l.text.trim() || l.url.trim());
    if (links.length > 0) {
      text += '\n\n延伸閱讀：\n' + links.map(l => `- [${l.text}](${l.url})`).join('\n');
    }
    return text;
  }).join('\n\n');
  const doneCount = sections.filter(s => s.content.trim()).length;
  const anyGenerating = sections.some(s => s.generating);

  async function generateSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    setSections(prev => prev.map(s => s.id === id ? { ...s, generating: true, content: '', editing: false } : s));
    setErrors(prev => ({ ...prev, [id]: '' }));
    try {
      const basePrompt = sec.customPrompt.trim()
        ? sec.customPrompt
        : buildSectionPromptByStyle(sec, outlineText, sec.promptStyle);
      const finalPrompt = sec.generateTable
        ? `${basePrompt}\n\n請在段落適當位置加入一個 Markdown 表格，整理此段落的重點資訊或比較項目。`
        : basePrompt;
      await streamAPI([
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: outlineMsg },
        { role: 'assistant', content: outlineResult },
        { role: 'user', content: finalPrompt },
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* 風格下拉 */}
                  <select
                    value={sec.promptStyle}
                    onChange={e => {
                      const newStyle = e.target.value as PromptStyle;
                      setSections(prev => prev.map(s => s.id === sec.id
                        ? { ...s, promptStyle: newStyle, customPrompt: '' }
                        : s));
                    }}
                    disabled={sec.generating}
                    className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                  >
                    {(Object.keys(STYLE_LABELS) as PromptStyle[]).map(k => (
                      <option key={k} value={k}>{STYLE_LABELS[k]}</option>
                    ))}
                  </select>
                  {/* 插入表格 */}
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sec.generateTable}
                      onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, generateTable: e.target.checked } : s))}
                      className="rounded"
                    />
                    表格
                  </label>
                  {/* 延伸閱讀 */}
                  <button
                    onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, showRelatedLinks: !s.showRelatedLinks } : s))}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${sec.showRelatedLinks ? 'bg-blue-50 border-blue-300 text-blue-700' : sec.relatedLinks.length > 0 ? 'border-blue-200 text-blue-600' : 'border-gray-300 text-gray-500 hover:bg-white'}`}
                  >
                    延伸閱讀{sec.relatedLinks.length > 0 ? ` (${sec.relatedLinks.length})` : ' +'}
                  </button>
                  {/* 提示詞預覽按鈕 */}
                  <button
                    onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, showPrompt: !s.showPrompt } : s))}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${sec.showPrompt ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-gray-300 text-gray-500 hover:bg-white'}`}
                  >
                    <EditIcon />{sec.customPrompt.trim() ? '自訂提示詞' : '提示詞'}
                  </button>
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

              {/* 提示詞編輯器 */}
              {sec.showPrompt && (
                <div className="px-5 py-4 border-t border-amber-100 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-amber-800">
                      提示詞預覽
                      {sec.customPrompt.trim() && <span className="ml-1.5 px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-xs">已自訂</span>}
                    </p>
                    {sec.customPrompt.trim() && (
                      <button
                        onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, customPrompt: '' } : s))}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        重設為預設
                      </button>
                    )}
                  </div>
                  <AutoTA
                    value={sec.customPrompt.trim() ? sec.customPrompt : buildSectionPromptByStyle(sec, outlineText, sec.promptStyle)}
                    onChange={v => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, customPrompt: v } : s))}
                    placeholder="在此輸入自訂提示詞，或直接修改上方預覽內容…"
                    className="px-3 py-2.5 border border-amber-200 rounded-xl text-xs font-mono bg-white min-h-[120px] focus:outline-none focus:ring-2 focus:ring-amber-300 text-gray-700"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">修改後即套用。切換風格下拉將清除自訂內容。</p>
                </div>
              )}

              {/* 延伸閱讀編輯器 */}
              {sec.showRelatedLinks && (
                <div className="px-5 py-4 border-t border-blue-100 bg-blue-50/30">
                  <p className="text-xs font-medium text-blue-800 mb-2">延伸閱讀連結</p>
                  <div className="space-y-2">
                    {sec.relatedLinks.map((link, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={link.text}
                          onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, relatedLinks: s.relatedLinks.map((l, j) => j === i ? { ...l, text: e.target.value } : l) } : s))}
                          placeholder="文章標題"
                          className="flex-1 px-2.5 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                        <input
                          value={link.url}
                          onChange={e => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, relatedLinks: s.relatedLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l) } : s))}
                          placeholder="https://..."
                          className="flex-1 px-2.5 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                        <button
                          onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, relatedLinks: s.relatedLinks.filter((_, j) => j !== i) } : s))}
                          className="text-gray-400 hover:text-red-500 text-xs px-1.5"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, relatedLinks: [...s.relatedLinks, { text: '', url: '' }] } : s))}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >+ 新增連結</button>
                  </div>
                </div>
              )}

              {errors[sec.id] && <div className="px-5 py-3"><Err msg={errors[sec.id]} /></div>}

              {(sec.content.trim() || sec.generating) && (
                <div className="px-5 py-4">
                  {sec.generating
                    ? <AutoTA value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        placeholder="撰寫中…"
                        className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[140px] focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    : sec.editing
                      ? <RichEditor
                          value={sec.content}
                          onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                          placeholder="開始編輯…"
                          minHeight="140px"
                        />
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
