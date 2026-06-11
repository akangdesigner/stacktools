'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RichEditor from '@/components/writer/RichEditor';
import SectionBlockEditor from '@/components/writer/SectionBlockEditor';
import StructurePanel from '@/components/writer/StructurePanel';

// ── Types ─────────────────────────────────────────────────────────────

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type SearchResult = { title: string; url: string; content: string };
type Stage = 'analyze' | 'outline' | 'write';

type PromptStyle = 'info' | 'scene' | 'faq' | 'compare' | 'conclusion';

const STYLE_LABELS: Record<PromptStyle, string> = {
  scene:      '前言',
  info:       '一般段落',
  compare:    '逐項比較',
  faq:        'FAQ',
  conclusion: '總結',
};

type ContentDepth = 'brief' | 'standard' | 'detailed';

const DEPTH_LABELS: Record<ContentDepth, string> = {
  brief:    '精簡',
  standard: '標準',
  detailed: '深度',
};

const DEPTH_INSTRUCTIONS: Record<ContentDepth, string> = {
  brief:    '篇幅精簡：整個段落（含所有 H3）控制在 150 字以內，每個 H3 只需 1–2 句核心重點，不展開細節。',
  standard: '篇幅標準：每個 H3 子節寫 3–4 句，涵蓋主要說明並附一個具體例子或判斷依據。',
  detailed: '篇幅深度：每個 H3 子節寫 4–6 句，包含具體案例、數據、操作細節或比較，充分說明不跳過。',
};

type RelatedLink = { text: string; url: string };

type Section = {
  id: string;
  h2: string;
  h3s: string[];
  content: string;
  generating: boolean;
  promptStyle: PromptStyle;
  generateTable: boolean;
  relatedLinks: RelatedLink[];
  showRelatedLinks: boolean;
  isEditing: boolean;
  revisePrompt: string;
  contentDepth: ContentDepth;
};

// ── Prompt Defaults（可被個人化覆蓋的靜態指令）────────────────────────

export const PROMPT_DEFAULTS = {
  analyze: `你是一位台灣繁體中文 SEO 內容策略師。根據提供的關鍵字與品牌資訊，產出 SEO 寫作控制表與標題提案，供後續撰文使用。

請依以下格式輸出，每個項目用 ### 標題分隔：

### 搜尋意圖
搜尋者是誰、核心需求、決策階段、主要疑慮。

### 競品觀察
首頁文章常見架構、內容形式、明顯競品缺口（3–5 點）。

### 品牌服務確認
只描述可被客觀確認的服務範圍。不可捏造服務、成果、數據或保證效果。資訊不足處標記「不可直接宣稱」。

### 文章策略
建議切入角度、需強化的內容面向、應避免的寫法（3–5 點）。

### 標題提案
直接列出 5 個標題，每行一個，不加編號、不加說明。

標題風格參考（勿複製，只參考結構與語氣）：
假牙種類有哪些？2 分鐘了解活動、固定與全口假牙優缺點與適用族群
MMA格鬥流派全解析：3分鐘看懂7大核心武術與實戰應用！
2026保養品推薦TOP 17！保濕、抗老、美白激推這幾款！

品牌相關內容必須保守處理，不得捏造任何內容。`,

  outline: `請根據這個標題建立 SEO 文章架構，目錄只列到 H3，不列 H4。

【固定結構規則 — 必須嚴格遵守】
文章架構固定為以下順序，不得更改：
1. 第一個 H2：標題固定為「前言」，不要加任何 H3，直接是短段落
2. 中間 3–5 個 H2：核心內容段落，依搜尋意圖排列，每個 H2 底下有 2–4 個 H3
3. 倒數第二個 H2：常見問題 FAQ，固定列出 5 個 H3（每個 H3 是一個常見問題的標題）
4. 最後一個 H2：總結，不需要 H3

輸出規則（必須遵守）：
- H2 是文章的各個主要段落名稱，不是文章標題本身。請直接從第一個 H2 段落開始輸出，不要把標題放進架構裡。
- H3 是各 H2 段落底下的小節。前言與總結不需要 H3。
- 只輸出 ## H2 和 ### H3，不要加其他說明文字、前言、序號或任何 Markdown 以外的文字。

內容段落標準：
- H2 / H3 必須是資訊整理型 SEO 標題，不要過度口語化、心得化或論文化。
- 段落順序符合讀者決策流程：概念理解 → 選擇判斷 → 注意事項 → 比較。
- 若 H2 過多，合併內容重疊的段落；次要主題下放為 H3。

若有需要調整，請直接輸出校正後的最終架構，不要另外寫分析說明。`,
};

// ── Prompts ───────────────────────────────────────────────────────────

function buildAnalyzePrompt(keyword: string, brandName: string, brandUrl: string, refs: SearchResult[], brandDescription = '', writingGuide = '', override = '') {
  const refBlock = refs.length > 0
    ? `以下是搜尋「${keyword}」取得的競品參考資料，請在分析時參考這些頁面：\n\n${refs.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content.slice(0, 300)}`).join('\n\n')}\n\n---\n\n`
    : '';
  const guideBlock = writingGuide.trim() ? `\n\n全域寫作指引（必須遵守）：\n${writingGuide.trim()}` : '';
  const body = override.trim() || PROMPT_DEFAULTS.analyze;
  return `${refBlock}${body}

關鍵字：${keyword}
品牌名稱：${brandName.trim() || '（未提供）'}
品牌網址：${brandUrl.trim() || '（未提供）'}${brandDescription.trim() ? `\n品牌描述：${brandDescription.trim()}` : ''}${guideBlock}

請進行 SEO 寫作控制表與標題提案。輸出完畢後請立即停止，不要自行產生文章架構、前言、段落或任何正文內容，等待下一步指令。`;
}

function buildOutlinePrompt(title: string, writingGuide = '', override = '') {
  const guideBlock = writingGuide.trim() ? `\n\n全域寫作指引（架構必須符合）：\n${writingGuide.trim()}` : '';
  const body = override.trim() || PROMPT_DEFAULTS.outline;
  return `我選擇：${title}

${body}${guideBlock}

請直接輸出架構，格式為 ## H2 和 ### H3，第一行從 ## 開始，不要有任何前言或說明。`;
}

function buildSectionPromptByStyle(sec: Section, outlineText: string, style: PromptStyle, completedContext = ''): string {
  const h3Block = sec.h3s.length > 0
    ? `\n\n此段落必須依序包含以下 H3 子節，每個 H3 請使用 ### 標題格式獨立成一小節，不可省略或合併：\n${sec.h3s.map(h => `- ### ${h}`).join('\n')}`
    : '';
  const prevBlock = completedContext.trim()
    ? `【已完成段落參考 — 避免重複說明相同內容，據此調整切入角度】\n${completedContext.trim()}\n\n`
    : '';
  const depthBlock = `\n\n篇幅要求：${DEPTH_INSTRUCTIONS[sec.contentDepth]}`;
  const h3FormatReminder = sec.h3s.length > 0 ? '，H3 子節一律使用 ### 標題格式' : '';
  const header = `${prevBlock}完整文章架構如下：\n${outlineText}\n\n現在請只撰寫「${sec.h2}」這個段落的正文內容。${h3Block}\n\n`;
  const footer = `${depthBlock}\n\n從 ## 標題開始輸出${h3FormatReminder}，只輸出該段落正文，不要加任何說明或備註。`;

  if (style === 'scene') {
    return `${header}這是文章的「前言」，需要快速破題、簡潔有力。

寫法要求：全段只有連續段落，不分 H3，不加條列。長度嚴格控制在 100–150 字以內（3–5 句話）。第一句直接破題，點出讀者的核心需求或問題，不要用故事感或情境感開場。必須自然帶到文章的主要關鍵字，關鍵字融入語意脈絡，不要硬塞。語氣直接通順，不說廢話。繁體中文，語氣簡潔專業。\n\n從 ## 標題開始輸出，只輸出前言正文，不要加任何說明或備註。`;
  }

  if (style === 'faq') {
    return `${header}這個段落以 Q&A 格式呈現常見問題與解答，預設列出 5 組問答。

寫法要求：每一題先用粗體寫出問題，問題語句要貼近讀者真正會搜尋的方式說話，然後用一到三句自然語句直接回答，不要再拆子條列。問題之間用空行分隔。不重複前面段落說過的內容。繁體中文，語氣直接親切。${footer}`;
  }

  if (style === 'compare') {
    return `${header}這個段落逐一介紹 H3 列出的各個品牌、產品或選項，讓讀者可以橫向比較。

格式規定：
- 每個 H3 子節對應一個品牌或選項，用 ### 標題單獨開頭
- 根據文章主題選定 3–4 個固定屬性（如：特色、費用、適合族群），所有 H3 使用完全相同的屬性欄位
- 每個屬性以「**屬性名稱**：說明」格式呈現
- 內容客觀中立，只描述可被確認的資訊，不捏造數據或保證效果

繁體中文，語氣清楚專業。${footer}`;
  }

  if (style === 'conclusion') {
    return `${header}這個段落是文章總結，幫助讀者回顧核心重點並做出決策。

寫法要求：2–4 句話整合全文核心重點，不重複前面已詳細說明的內容，不要只是條列各段標題。若有品牌，可自然引導讀者下一步（如：諮詢、了解更多），語氣收尾有力但不強推。繁體中文，簡潔有力。${footer}`;
  }

  // 預設 info 風格
  return `${header}這個段落要提供清楚、實用的資訊，讓讀者讀完真的有收穫。

寫法要求：以散文段落寫作為主。若需要條列，格式必須是「**粗體名稱**：一句說明」，不要用普通的 - 條列符號。每一句都要有資訊量，刪掉廢話和沒意義的過場句。若有需要引用文獻、法規、研究數據，自然融入段落並附來源。繁體中文，風格清楚自然。${footer}`;
}

const QUALITY_RULES = `內容品質規則（每句都要符合）：
- 每句必須有新資訊或判斷，不重複說法，不加空泛轉場句。
- 禁用「先否定再肯定」句型：不是A而是B、不只是A更是B、不應該A而應該B。
- 格式依內容性質：說明型→段落；條件/注意→項目符號（**粗體**：說明）；步驟→編號；比較→表格。`;

function buildSystemMessage(sectionOverride: string, brandDescription: string, clientWritingRules: string, writingGuide: string): string {
  const parts: string[] = [];
  // 使用者寫作規則排最前面，確保模型第一眼就看到且優先執行
  if (sectionOverride.trim()) {
    parts.push(`【使用者指定寫作規則 — 最高優先，必須在每一句話中完全體現，不得打折扣】\n${sectionOverride.trim()}`);
  }
  if (brandDescription.trim()) {
    parts.push(`【品牌背景資訊 — 只作為事實依據，不得捏造超出此範圍的內容】\n${brandDescription.trim()}`);
  }
  if (clientWritingRules.trim()) {
    parts.push(`【客戶寫作風格 — 高優先，若與使用者指定規則無衝突則一起遵守】\n${clientWritingRules.trim()}`);
  }
  const guideText = [writingGuide.trim(), QUALITY_RULES].filter(Boolean).join('\n\n');
  parts.push(`【全域寫作規則】\n${guideText}`);
  return parts.join('\n\n');
}

// 小模型在長對話下會忽略 system message 的風格規則，必須把規則原文重申在最後一則訊息結尾
function buildPriorityReminder(sectionOverride: string, clientWritingRules: string): string {
  if (!sectionOverride.trim() && !clientWritingRules.trim()) return '';
  const parts = ['【寫作規則重申 — 絕對優先，優先於上述所有寫法、語氣與品質要求】'];
  if (clientWritingRules.trim()) parts.push(`客戶寫作風格：\n${clientWritingRules.trim()}`);
  if (sectionOverride.trim()) parts.push(`使用者指定寫作規則（最高優先，逐字執行，不得淡化或省略）：\n${sectionOverride.trim()}`);
  parts.push('輸出前自我檢查：若任何一段沒有完整體現上述規則，該輸出視為錯誤，必須重寫後再輸出。');
  return '\n\n' + parts.join('\n\n');
}

// CommonMark 不解析「**注意：**內容」這種粗體內含結尾標點又緊接文字的寫法（** 會原樣顯示），把標點移出粗體
function normalizeBoldPunctuation(md: string): string {
  return md.replace(/\*\*([^*\n]+?)([：:，。、；！？]+)\*\*(?=\S)/g, '**$1**$2');
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
      if (t.startsWith('#')) break; // 遇到下一個 ### 區塊就停止
      // 有前綴：「1. 標題」「- 標題」「標題N:」等
      const prefixMatch = t.match(/^(?:標題(?:提案)?\s*\d+\s*[：:]\s*|\d+[.、)]\s*|[-*•]\s+|\*\*\d+[.、)]\s*)(.+)/);
      const raw = prefixMatch ? prefixMatch[1] : (t.length >= 8 ? t : null);
      if (raw) {
        const title = raw
          .replace(/^標題(?:提案)?\s*\d+\s*[：:]\s*/, '') // 移除殘留「標題N:」前綴
          .replace(/\*\*/g, '')                   // 移除 bold 符號
          .replace(/\s*[—–]\s*.+$/, '')            // 移除 em/en dash 後的說明
          .replace(/\s+-\s+.+$/, '')               // 移除「空格-空格」後的說明
          .replace(/\s*[（(][^）)]*[）)]\s*$/, '')  // 移除結尾括號說明
          .replace(/搜尋意圖[：:].+$/, '')           // 移除「搜尋意圖：...」尾綴
          .trim();
        if (title.length >= 8) titles.push(title);
      }
    }
  }
  return titles;
}

function detectStyle(h2: string, index: number, total: number): PromptStyle {
  if (index === 0) return 'scene';
  if (index === total - 1) return 'conclusion';
  if (index === total - 2) return 'faq';
  if (/比較|評比|評測|排行|TOP\s*\d|十大|推薦名單/.test(h2)) return 'compare';
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
        promptStyle: 'info', // 暫定，解析完後統一套用 detectStyle
        generateTable: /比較|差異|優缺點|選購指南|推薦/.test(h2text),
        relatedLinks: [],
        showRelatedLinks: false,
        isEditing: false,
        revisePrompt: '',
        contentDepth: 'standard',
      };
    } else if (h3 && cur) {
      cur.h3s.push(h3[1].trim());
    }
  }
  if (cur) sections.push(cur);
  const total = sections.length;
  return sections.map((s, i) => ({ ...s, promptStyle: detectStyle(s.h2, i, total) }));
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


function AutoTA({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight + 2}px`; }
  }, [value]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} className={`resize-none overflow-hidden w-full ${className ?? ''}`} />;
}

// ── PromptEditModal ───────────────────────────────────────────────────

function PromptEditModal({ defaultText, currentOverride, onSave, onClose }: {
  defaultText: string;
  currentOverride: string;
  onSave: (text: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentOverride.trim() || defaultText);
  const isCustom = currentOverride.trim() !== '';

  function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === defaultText.trim()) {
      onSave(null);
    } else {
      onSave(trimmed);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">提示詞設定</p>
            <p className="text-xs text-gray-400 mt-0.5">修改後按「儲存個人版」，重新產生時會自動套用。</p>
          </div>
          <div className="flex items-center gap-2">
            {isCustom && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">已個人化</span>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <AutoTA
            value={draft}
            onChange={setDraft}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[220px] focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-700"
          />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => setDraft(defaultText)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            重置為預設
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors text-gray-600">取消</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">儲存個人版</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SystemPromptModal（Stage 3 寫作規則 = 完整 system prompt）─────────

function SystemPromptModal({ writingGuide, clientWritingRules, brandDescription, currentOverride, onSave, onClose }: {
  writingGuide: string;
  clientWritingRules: string;
  brandDescription: string;
  currentOverride: string;
  onSave: (text: string | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentOverride);
  const [copied, setCopied] = useState(false);
  const preview = buildSystemMessage(draft, brandDescription, clientWritingRules, writingGuide);

  function handleSave() {
    onSave(draft.trim() || null);
    onClose();
  }

  function copyPreview() {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">段落寫作規則（System Prompt）</p>
            <p className="text-xs text-gray-400 mt-0.5">每次產生段落時，以下內容會依此順序組合成一個 system prompt 送給模型。</p>
          </div>
          <div className="flex items-center gap-2">
            {draft.trim() !== '' && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">已設定個人規則</span>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* 1. 個人額外規則（可編輯） */}
          <div className="px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-1.5">① 個人額外規則（最高優先，可編輯）</p>
            <AutoTA
              value={draft}
              onChange={setDraft}
              placeholder="留空＝不加入。輸入後會放在 system prompt 最前面，優先於客戶與全域規則。"
              className="px-3 py-2.5 border border-amber-200 rounded-lg text-xs font-mono bg-white min-h-[80px] focus:outline-none focus:ring-2 focus:ring-amber-300 text-gray-700"
            />
          </div>

          {/* 2. 品牌背景（唯讀） */}
          <div className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">② 品牌背景資訊（唯讀，來自客戶設定）</p>
            {brandDescription.trim()
              ? <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{brandDescription.trim()}</p>
              : <p className="text-xs text-gray-400">未填寫 — 不會加入 system prompt</p>}
          </div>

          {/* 3. 客戶寫作風格（唯讀） */}
          <div className="px-3 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">③ 客戶寫作風格（唯讀，來自客戶設定）</p>
            {clientWritingRules.trim()
              ? <p className="text-xs text-blue-900 whitespace-pre-wrap leading-relaxed">{clientWritingRules.trim()}</p>
              : <p className="text-xs text-gray-400">未選擇客戶 — 不會加入 system prompt</p>}
          </div>

          {/* 4. 全域寫作規則（唯讀） */}
          <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-xs font-semibold text-emerald-700 mb-1.5">④ 全域寫作規則（唯讀，來自全域設定＋內建品質規則）</p>
            <p className="text-xs text-emerald-900 whitespace-pre-wrap leading-relaxed">{[writingGuide.trim(), QUALITY_RULES].filter(Boolean).join('\n\n')}</p>
          </div>

          {/* 完整組合預覽 */}
          <div className="px-3 py-3 bg-gray-900 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-300">完整 System Prompt（實際送出內容，{preview.length} 字）</p>
              <button onClick={copyPreview} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors">
                {copied ? '已複製 ✓' : '複製'}
              </button>
            </div>
            <pre className="text-xs text-gray-100 whitespace-pre-wrap leading-relaxed font-mono max-h-60 overflow-y-auto">{preview}</pre>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => setDraft('')}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            清除個人規則
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors text-gray-600">取消</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">儲存</button>
          </div>
        </div>
      </div>
    </div>
  );
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

type GscClientOption = { id: number; name: string };
type BrandProfileOption = { gsc_client_id: number; brand_url: string; brand_description: string; writing_rules: string };

// ── Stage 1 ───────────────────────────────────────────────────────────

function Stage1({ keyword, vendor, writingGuide, analyzeOverride, onSaveAnalyzeOverride, onDone }: {
  keyword: string; vendor: string; writingGuide: string;
  analyzeOverride: string;
  onSaveAnalyzeOverride: (text: string | null) => void;
  onDone: (analyzeMsg: string, analysisResult: string, title: string, clientWritingRules: string, brandDescription: string) => void;
}) {
  const [brandName, setBrandName] = useState(vendor);
  const [brandUrl, setBrandUrl] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [clientWritingRules, setClientWritingRules] = useState('');
  const [gscClients, setGscClients] = useState<GscClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPage, setSearchPage] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const analyzeMsg = useRef('');

  useEffect(() => {
    fetch('/api/gsc/clients').then(r => r.json()).then((list: GscClientOption[]) => {
      setGscClients(list.filter(c => c.name));
    }).catch(() => {});
  }, []);

  function handleClientChange(id: number | null) {
    setSelectedClientId(id);
    if (id === null) { setBrandName(vendor); setBrandUrl(''); setBrandDescription(''); setClientWritingRules(''); return; }
    const c = gscClients.find(x => x.id === id);
    if (c) {
      setBrandName(c.name);
      fetch(`/api/writer/brand-profile?clientId=${id}`)
        .then(r => r.json())
        .then((p: BrandProfileOption) => {
          setBrandUrl(p.brand_url ?? '');
          setBrandDescription(p.brand_description ?? '');
          setClientWritingRules(p.writing_rules ?? '');
        })
        .catch(() => {});
    }
  }

  async function fetchSearch(): Promise<SearchResult[]> {
    setSearching(true);
    setSearchPage(0);
    try {
      const r = await fetch(`/api/writer/search?keyword=${encodeURIComponent(keyword)}`);
      if (r.ok) {
        const refs = ((await r.json()) as { results?: SearchResult[] }).results ?? [];
        setSearchResults(refs);
        return refs;
      }
    } catch { /* 不阻斷 */ } finally { setSearching(false); }
    return [];
  }

  async function run() {
    setResult(''); setError(''); setTitles([]); setSelectedTitle('');
    setSearchResults([]);

    const refs = await fetchSearch();

    const combinedGuide = [writingGuide, clientWritingRules].filter(Boolean).join('\n\n');
    const msg = buildAnalyzePrompt(keyword, brandName, brandUrl, refs, brandDescription, combinedGuide, analyzeOverride);
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
      {gscClients.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">選擇客戶</label>
          <select className={inputCls} value={selectedClientId ?? ''} onChange={e => handleClientChange(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">── 不選擇（手動輸入）──</option>
            {gscClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {selectedClientId && !brandDescription && (
            <p className="mt-1 text-xs text-gray-400">此客戶尚未填寫品牌描述，可至 <a href="/writer#clients" className="underline text-blue-500">客戶設定</a> 新增。</p>
          )}
        </div>
      )}
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
      <div className="flex items-center gap-2">
        <button onClick={run} disabled={searching || analyzing || !keyword.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50">
          {(searching || analyzing) && <Spinner />}
          {searching ? '搜尋競品資料中…' : analyzing ? '分析中…' : '開始 SEO 分析'}
        </button>
        <button
          onClick={() => setShowPromptModal(true)}
          title="查看／修改提示詞"
          className={`flex items-center gap-1 px-3 py-2.5 text-sm border rounded-xl transition-colors ${analyzeOverride.trim() ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
        >
          <EditIcon />提示詞
        </button>
      </div>

      {showPromptModal && (
        <PromptEditModal
          defaultText={PROMPT_DEFAULTS.analyze}
          currentOverride={analyzeOverride}
          onSave={onSaveAnalyzeOverride}
          onClose={() => setShowPromptModal(false)}
        />
      )}

      {error && <Err msg={error} />}

      {searchResults.length > 0 && (() => {
        const PAGE_SIZE = 5;
        const totalPages = Math.ceil(searchResults.length / PAGE_SIZE);
        const displayed = searchResults.slice(searchPage * PAGE_SIZE, (searchPage + 1) * PAGE_SIZE);
        return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              Tavily 競品參考連結
              {totalPages > 1 && <span className="text-gray-400">（{searchPage + 1}/{totalPages}）</span>}
            </p>
            {totalPages > 1 && (
              <button
                onClick={() => setSearchPage(p => (p + 1) % totalPages)}
                disabled={searching || analyzing}
                className="flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                換一批
              </button>
            )}
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
            {displayed.map((r, i) => (
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
        );
      })()}

      {(result || analyzing) && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">分析結果</label>
          {analyzing
            ? (
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Spinner />
                    <span>AI 分析中，正在整理 SEO 寫作控制表…</span>
                  </div>
                  {result && <span className="text-xs text-gray-400">{result.length} 字</span>}
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full transition-all duration-500"
                    style={{ width: result ? `${Math.min(90, Math.round(result.length / 9))}%` : '8%' }}
                  />
                </div>
                <div className="space-y-2.5">
                  {['搜尋意圖', '競品觀察', '品牌服務確認', '文章策略', '標題提案'].map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            )
            : <AnalysisEditor value={result} onChange={setResult} />
          }
        </div>
      )}

      {result && !analyzing && (
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <label className="block text-sm font-semibold text-gray-800">選擇 SEO 標題</label>
          <TitleSelector titles={titles} value={selectedTitle} onChange={setSelectedTitle} />
          {selectedTitle && (
            <button onClick={() => onDone(analyzeMsg.current, result, selectedTitle, clientWritingRules, brandDescription)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors">
              確認標題，進入架構規劃 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AnalysisEditor ────────────────────────────────────────────────────

type ASection = { id: string; label: string; content: string };

function parseAnalysis(text: string): ASection[] {
  const result: ASection[] = [];
  let cur: ASection | null = null;
  for (const line of text.split('\n')) {
    const t = line.trimEnd();
    const hm = t.match(/^(#{1,4})\s+(?:\d+[.、)]\s*)?(.+)/);
    const nm = !hm && t.match(/^(\d+)[.、)]\s+(.+)/);
    const bm = !hm && !nm && t.match(/^\*\*([^*]{2,30})\*\*\s*[:：]?\s*$/);
    const rawLabel = hm ? hm[2] : nm ? nm[2] : bm ? bm[1] : null;
    const label = rawLabel?.replace(/[:：]\s*$/, '').trim() ?? null;
    const maxLen = nm ? 6 : 35;
    if (label && label.length >= 2 && label.length <= maxLen) {
      if (cur) result.push(cur);
      cur = { id: Math.random().toString(36).slice(2), label, content: '' };
    } else if (cur !== null) {
      if (cur.content || t.trim()) cur.content += (cur.content ? '\n' : '') + t;
    }
  }
  if (cur) result.push(cur);
  return result
    .map(s => ({ ...s, content: s.content.replace(/\*\*([^*]+)\*\*/g, '$1').trimEnd() }))
    .filter(s => s.content.trim() !== '');
}

function AnalysisEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {

  function serialize(secs: ASection[]): string {
    return secs.map(s => `## ${s.label}${s.content ? '\n' + s.content : ''}`).join('\n\n');
  }

  const [sections, setSections] = useState<ASection[]>(() => parseAnalysis(value));

  function update(next: ASection[]) { setSections(next); onChange(serialize(next)); }

  if (sections.length === 0) {
    return (
      <AutoTA value={value} onChange={onChange} placeholder="（空白）"
        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[140px] focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700" />
    );
  }

  return (
    <div className="space-y-3 px-4 py-4 border border-blue-200 rounded-xl bg-white">
      {sections.map((sec, i) => (
        <div key={sec.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <input
              value={sec.label}
              onChange={e => update(sections.map((s, j) => j === i ? { ...s, label: e.target.value } : s))}
              className="text-sm font-semibold text-gray-800 bg-transparent border-none focus:outline-none flex-1"
            />
          </div>
          <div className="pl-7">
            <AutoTA
              value={sec.content}
              onChange={v => update(sections.map((s, j) => j === i ? { ...s, content: v } : s))}
              placeholder="（無內容）"
              className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AnalysisNote ──────────────────────────────────────────────────────

function AnalysisNote({ analysisResult }: { analysisResult: string }) {
  const [open, setOpen] = useState(false);
  const sections = parseAnalysis(analysisResult).filter(s => !s.label.includes('標題'));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="SEO 分析筆記"
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-amber-400 hover:bg-amber-500 text-white py-4 px-2 rounded-l-xl shadow-lg transition-all duration-200 ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ writingMode: 'vertical-rl' }}
      >
        <span className="text-xs font-semibold tracking-wide">SEO 筆記</span>
      </button>

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <div className={`fixed top-0 right-0 h-full w-72 bg-amber-50 border-l border-amber-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200 bg-amber-100/70 shrink-0">
          <p className="text-sm font-semibold text-amber-900">SEO 分析筆記</p>
          <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-amber-200 text-amber-700 text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {sections.length === 0
            ? <p className="text-xs text-gray-400">尚無分析內容</p>
            : sections.map((sec, i) => (
              <div key={sec.id}>
                <p className="text-xs font-bold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  {sec.label}
                </p>
                <div className="pl-6 space-y-0.5">
                  {sec.content.split('\n').map(l => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean).map((line, li) => (
                    <p key={li} className="text-xs text-gray-700 leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
}

// ── OutlineEditor ─────────────────────────────────────────────────────

function OutlineEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  type Item = { h2: string; h3s: string[] };

  function parse(text: string): Item[] {
    const items: Item[] = [];
    let cur: Item | null = null;
    for (const line of text.split('\n')) {
      const h2m = line.match(/^##\s+(.+)/);
      const h3m = line.match(/^###\s+(.+)/);
      if (h2m) { if (cur) items.push(cur); cur = { h2: h2m[1].trim(), h3s: [] }; }
      else if (h3m && cur) { cur.h3s.push(h3m[1].trim()); }
    }
    if (cur) items.push(cur);
    return items;
  }

  function serialize(items: Item[]): string {
    return items.map(it => {
      let t = `## ${it.h2}`;
      if (it.h3s.length > 0) t += '\n' + it.h3s.map(h => `### ${h}`).join('\n');
      return t;
    }).join('\n\n');
  }

  const [items, setItems] = useState<Item[]>(() => parse(value));

  function update(next: Item[]) { setItems(next); onChange(serialize(next)); }

  const field = 'flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white';

  return (
    <div className="space-y-2 px-4 py-4 border border-blue-200 rounded-xl bg-white min-h-[180px]">
      {items.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2 group">
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs font-bold rounded shrink-0">H2</span>
            <input
              value={item.h2}
              onChange={e => update(items.map((it, ii) => ii === i ? { ...it, h2: e.target.value } : it))}
              placeholder="段落標題"
              className={field}
            />
            <button onClick={() => update(items.filter((_, ii) => ii !== i))} className="text-gray-200 group-hover:text-gray-400 hover:!text-red-400 px-1 shrink-0 text-xs transition-colors">✕</button>
          </div>
          {item.h3s.map((h, j) => (
            <div key={j} className="flex items-center gap-2 pl-6 group">
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded shrink-0">H3</span>
              <input
                value={h}
                onChange={e => update(items.map((it, ii) => ii === i ? { ...it, h3s: it.h3s.map((hh, jj) => jj === j ? e.target.value : hh) } : it))}
                placeholder="小節標題"
                className={`${field} border-gray-100 text-gray-600 text-xs`}
              />
              <button onClick={() => update(items.map((it, ii) => ii === i ? { ...it, h3s: it.h3s.filter((_, jj) => jj !== j) } : it))} className="text-gray-200 group-hover:text-gray-400 hover:!text-red-400 px-1 shrink-0 text-xs transition-colors">✕</button>
            </div>
          ))}
          <button onClick={() => update(items.map((it, ii) => ii === i ? { ...it, h3s: [...it.h3s, ''] } : it))} className="pl-6 text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 transition-colors">＋ H3 小節</button>
        </div>
      ))}
      <div className="pt-1">
        <button onClick={() => update([...items, { h2: '', h3s: [] }])} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors">＋ 段落</button>
      </div>
    </div>
  );
}

// ── Stage 2 ───────────────────────────────────────────────────────────

function Stage2({ title, analyzeMsg, analysisResult, writingGuide, outlineOverride, onSaveOutlineOverride, onBack, onDone }: {
  title: string; analyzeMsg: string; analysisResult: string; writingGuide: string;
  outlineOverride: string;
  onSaveOutlineOverride: (text: string | null) => void;
  onBack: () => void;
  onDone: (outlineMsg: string, outlineResult: string, sections: Section[]) => void;
}) {
  const [outlining, setOutlining] = useState(false);
  const [outline, setOutline] = useState('');
  const [error, setError] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const outlineMsg = useRef('');
  const runId = useRef(0);

  useEffect(() => { run(); }, []); // 自動開始

  async function run() {
    const id = ++runId.current;
    const msg = buildOutlinePrompt(title, writingGuide, outlineOverride);
    outlineMsg.current = msg;
    setOutline(''); setError(''); setOutlining(true);
    try {
      await streamAPI([
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: msg },
      ], chunk => { if (runId.current === id) setOutline(r => r + chunk); });
    } catch (e) { if (runId.current === id) setError(e instanceof Error ? e.message : '產生架構失敗'); }
    finally { if (runId.current === id) setOutlining(false); }
  }

  function confirm() {
    const sections = parseOutline(outline);
    if (sections.length === 0) return;
    onDone(outlineMsg.current, outline, sections);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <AnalysisNote analysisResult={analysisResult} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">選定標題</p>
          <p className="text-base font-semibold text-gray-900">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPromptModal(true)}
            title="查看／修改提示詞"
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${outlineOverride.trim() ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            <EditIcon />提示詞
          </button>
          <button onClick={run} disabled={outlining} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {outlining && <Spinner />}重新產生
          </button>
        </div>
      </div>

      {showPromptModal && (
        <PromptEditModal
          defaultText={PROMPT_DEFAULTS.outline}
          currentOverride={outlineOverride}
          onSave={onSaveOutlineOverride}
          onClose={() => setShowPromptModal(false)}
        />
      )}

      {error && <Err msg={error} />}

      {outlining && !outline && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8"><Spinner /> 產生架構中…</div>
      )}

      {outline && outlining && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner />產生架構中…</div>
          <div className="px-4 py-4 border border-gray-100 rounded-xl bg-white font-mono text-sm text-gray-600 whitespace-pre-wrap min-h-[100px] leading-relaxed">{outline}</div>
        </div>
      )}

      {outline && !outlining && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-600">文章架構（可直接編輯）</label>
          <OutlineEditor value={outline} onChange={setOutline} />
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

function Stage3({ title, keyword, analyzeMsg, analysisResult, outlineMsg, outlineResult, initSections, writingGuide, clientWritingRules, brandDescription, sectionOverride, onSaveSectionOverride, onBack }: {
  title: string; keyword: string;
  analyzeMsg: string; analysisResult: string;
  outlineMsg: string; outlineResult: string;
  initSections: Section[]; writingGuide: string;
  clientWritingRules: string;
  brandDescription: string;
  sectionOverride: string;
  onSaveSectionOverride: (text: string | null) => void;
  onBack: () => void;
}) {
  const [sections, setSections] = useState<Section[]>(initSections);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [proofread, setProofread] = useState('');
  const [proofreading, setProofreading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showSectionPromptModal, setShowSectionPromptModal] = useState(false);
  const [showStructure, setShowStructure] = useState(false);

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
    setSections(prev => prev.map(s => s.id === id ? { ...s, generating: true, content: '' } : s));
    setErrors(prev => ({ ...prev, [id]: '' }));
    try {
      const completedContext = sections
        .filter(s => s.id !== id && s.content.trim())
        .map(s => `## ${s.h2}\n${s.content.trim().slice(0, 400)}`)
        .join('\n\n---\n\n');
      const basePrompt = buildSectionPromptByStyle(sec, outlineText, sec.promptStyle, completedContext);
      const finalPrompt = (sec.generateTable
        ? `${basePrompt}\n\n請在段落適當位置加入一個 Markdown 表格，整理此段落的重點資訊或比較項目。`
        : basePrompt) + buildPriorityReminder(sectionOverride, clientWritingRules);
      const sys = buildSystemMessage(sectionOverride, brandDescription, clientWritingRules, writingGuide);
      const sysMsg: Message[] = sys ? [{ role: 'system', content: sys }] : [];
      await streamAPI([
        ...sysMsg,
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: outlineMsg },
        { role: 'assistant', content: outlineResult },
        { role: 'user', content: finalPrompt },
      ], chunk => setSections(prev => prev.map(s => s.id === id ? { ...s, content: s.content + chunk } : s)));
    } catch (e) { setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : '產生失敗' })); }
    finally { setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: normalizeBoldPunctuation(s.content) } : s)); }
  }

  async function reviseSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec || !sec.revisePrompt.trim()) return;
    const instruction = sec.revisePrompt.trim();
    setSections(prev => prev.map(s => s.id === id ? { ...s, generating: true, content: '', revisePrompt: '', isEditing: false } : s));
    setErrors(prev => ({ ...prev, [id]: '' }));
    try {
      const sys = buildSystemMessage(sectionOverride, brandDescription, clientWritingRules, writingGuide);
      const sysMsg: Message[] = sys ? [{ role: 'system', content: sys }] : [];
      await streamAPI([
        ...sysMsg,
        { role: 'user', content: analyzeMsg },
        { role: 'assistant', content: analysisResult },
        { role: 'user', content: outlineMsg },
        { role: 'assistant', content: outlineResult },
        { role: 'user', content: `以下是「${sec.h2}」段落的現有內容：\n\n${sec.content}\n\n修改指令：${instruction}\n\n請根據修改指令調整段落內容，保持 Markdown 格式，從 ## 標題開始輸出，只輸出修改後的段落，不要加任何說明或備註。${buildPriorityReminder(sectionOverride, clientWritingRules)}` },
      ], chunk => setSections(prev => prev.map(s => s.id === id ? { ...s, content: s.content + chunk } : s)));
    } catch (e) { setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : '修改失敗' })); }
    finally { setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: normalizeBoldPunctuation(s.content) } : s)); }
  }

  async function generateAll() {
    const pending = sections.filter(s => !s.content.trim() && !s.generating);
    for (const s of pending) {
      await generateSection(s.id);
    }
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
      <AnalysisNote analysisResult={analysisResult} />
      <StructurePanel
        open={showStructure}
        onClose={() => setShowStructure(false)}
        sections={sections}
        onUpdate={setSections}
      />

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
          <button
            onClick={() => setShowStructure(v => !v)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${showStructure ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            結構
          </button>
          <button
            onClick={() => setShowSectionPromptModal(true)}
            title="查看／修改段落寫作規則"
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${sectionOverride.trim() ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            <EditIcon />寫作規則
          </button>
          <button onClick={generateAll} disabled={anyGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
            {anyGenerating && <Spinner />}全部產生
          </button>
        </div>
      </div>

      {showSectionPromptModal && (
        <SystemPromptModal
          writingGuide={writingGuide}
          clientWritingRules={clientWritingRules}
          brandDescription={brandDescription}
          currentOverride={sectionOverride}
          onSave={onSaveSectionOverride}
          onClose={() => setShowSectionPromptModal(false)}
        />
      )}

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
                        ? { ...s, promptStyle: newStyle }
                        : s));
                    }}
                    disabled={sec.generating}
                    className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                  >
                    {(Object.keys(STYLE_LABELS) as PromptStyle[]).map(k => (
                      <option key={k} value={k}>{STYLE_LABELS[k]}</option>
                    ))}
                  </select>
                  {/* 深度下拉 */}
                  <select
                    value={sec.contentDepth}
                    onChange={e => setSections(prev => prev.map(s => s.id === sec.id
                      ? { ...s, contentDepth: e.target.value as ContentDepth }
                      : s))}
                    disabled={sec.generating}
                    className="text-xs px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                  >
                    {(Object.keys(DEPTH_LABELS) as ContentDepth[]).map(k => (
                      <option key={k} value={k}>{DEPTH_LABELS[k]}</option>
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
                  {sec.content.trim() && !sec.generating && (
                    <button
                      onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, isEditing: !s.isEditing } : s))}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${sec.isEditing ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-500 hover:bg-white'}`}
                    >
                      {sec.isEditing ? '完成' : '編輯'}
                    </button>
                  )}
                  <button onClick={() => generateSection(sec.id)} disabled={sec.generating}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${sec.content.trim() ? 'border border-gray-300 text-gray-600 hover:bg-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                    {sec.generating && <Spinner />}
                    {sec.generating ? '撰寫中…' : sec.content.trim() ? '重新產生' : '產生段落'}
                  </button>
                </div>
              </div>


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
                <div className="px-5 pt-4 pb-3">
                  {sec.generating
                    ? <AutoTA value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        placeholder="撰寫中…"
                        className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[140px] focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    : <SectionBlockEditor
                        value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        editable={sec.isEditing}
                      />
                  }
                  {/* AI 修改輸入框 */}
                  {sec.content.trim() && !sec.generating && (
                    <div className="mt-3 flex items-end gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus-within:border-gray-400 transition-colors">
                      <AutoTA
                        value={sec.revisePrompt}
                        onChange={v => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, revisePrompt: v } : s))}
                        placeholder="輸入修改指令，例如：把語氣改得更強硬、縮短篇幅、加入比較表格…"
                        className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none resize-none min-h-[36px]"
                      />
                      <button
                        onClick={() => reviseSection(sec.id)}
                        disabled={!sec.revisePrompt.trim()}
                        className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        AI 修改
                      </button>
                    </div>
                  )}
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
                  : <RichEditor value={proofread} onChange={() => {}} editable={false} />
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
                  ? <RichEditor value={fullArticle} onChange={() => {}} editable={false} />
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
  const [writingGuide, setWritingGuide] = useState('');
  const [clientWritingRules, setClientWritingRules] = useState('');
  const [brandDescription, setBrandDescriptionGlobal] = useState('');
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});

  // Cross-stage context
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [outlineMsg, setOutlineMsg] = useState('');
  const [outlineResult, setOutlineResult] = useState('');
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    fetch('/api/writer/settings').then(r => r.json()).then((s: { writing_guide?: string }) => {
      if (s.writing_guide) setWritingGuide(s.writing_guide);
    }).catch(() => {});
    fetch('/api/writer/prompt-override').then(r => r.json()).then((overrides: Record<string, string>) => {
      setPromptOverrides(overrides);
    }).catch(() => {});
  }, []);

  async function savePromptOverride(stageKey: string, text: string | null) {
    try {
      await fetch('/api/writer/prompt-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stageKey, prompt_text: text }),
      });
      setPromptOverrides(prev => {
        const next = { ...prev };
        if (text === null) { delete next[stageKey]; } else { next[stageKey] = text; }
        return next;
      });
    } catch { /* 靜默失敗 */ }
  }

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
            writingGuide={writingGuide}
            analyzeOverride={promptOverrides.analyze ?? ''}
            onSaveAnalyzeOverride={text => savePromptOverride('analyze', text)}
            onDone={(msg, result, title, rules, brandDesc) => {
              setAnalyzeMsg(msg);
              setAnalysisResult(result);
              setSelectedTitle(title);
              setClientWritingRules(rules);
              setBrandDescriptionGlobal(brandDesc);
              setStage('outline');
            }}
          />
        )}
        {stage === 'outline' && (
          <Stage2
            title={selectedTitle}
            analyzeMsg={analyzeMsg}
            analysisResult={analysisResult}
            writingGuide={[writingGuide, clientWritingRules].filter(Boolean).join('\n\n')}
            outlineOverride={promptOverrides.outline ?? ''}
            onSaveOutlineOverride={text => savePromptOverride('outline', text)}
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
            writingGuide={writingGuide}
            clientWritingRules={clientWritingRules}
            brandDescription={brandDescription}
            sectionOverride={promptOverrides.section ?? ''}
            onSaveSectionOverride={text => savePromptOverride('section', text)}
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
