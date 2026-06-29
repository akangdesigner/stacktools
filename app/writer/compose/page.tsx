'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RichEditor from '@/components/writer/RichEditor';
import SectionBlockEditor from '@/components/writer/SectionBlockEditor';
import StructurePanel from '@/components/writer/StructurePanel';

// ── Types ─────────────────────────────────────────────────────────────

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type SearchResult = { title: string; url: string; content: string };
type Stage = 'analyze' | 'outline' | 'write' | 'review';

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
  brief:    `篇幅精簡：
・每個 H3 寫 1 段，3–4 句，約 100–130 字
・只給核心結論 + 一個最重要的判斷依據，不展開細節、不舉例
・整個段落（含所有 H3）總字數控制在 350 字以內`,
  standard: `篇幅標準：
・每個 H3 寫 1 段，5–6 句，約 180–220 字
・核心概念之外，至少加 1 個具體判斷依據或情境舉例，內容要比精簡版本更完整
・自然段落書寫`,
  detailed: `篇幅深度：
・每個 H3 寫 2–3 段，約 300–400 字
・必須包含：具體數字或研究結論、操作步驟或情境範例、常見錯誤或注意事項至少其中兩項
・內容要讓讀者讀完即可判斷或操作，不能只是概念說明`,
};

// 不論篇幅深度，是否使用條列只由各 H3 的「列點」勾選決定，深度指示本身不應暗示或允許自行加條列
const NO_AUTO_LIST_REMINDER = '・除非這個 H3 另外被標記為條列格式，否則一律寫成自然段落，不要自行轉成條列或項目符號';

// 表格內容不計入篇幅字數要求，否則 AI 會把字數要求灌進表格裡，導致精簡/標準/深度三個等級看起來沒有差異；
// 只講「文字仍要寫滿」AI 還是會把表格當主角、前後文字隨便帶過，所以要明確要求表格前後都要有實質段落
const TABLE_WORDCOUNT_REMINDER = '・表格只是文字說明以外「額外」的補充整理，不能取代文字內容，也不能只用一兩句話帶過表格就結束。寫法：表格前先完整說明這個主題的背景、原因或判斷依據；表格後再寫一段延伸補充（表格沒列出的細節、例外情況或具體案例），不是隨口收尾。上面的字數要求只算這些表格以外的文字，且前後兩段加總仍要完整達到該字數，不可因為有表格就把文字內容寫短';

type Section = {
  id: string;
  h2: string;
  h3s: string[];
  content: string;
  generating: boolean;
  promptStyle: PromptStyle;
  generateTable: boolean;
  isEditing: boolean;
  revisePrompt: string;
  reviseQuotes: string[];
  contentDepth: ContentDepth;
  h3Depths: ContentDepth[];
  h3Tables: boolean[];
  h3Lists: boolean[];
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

function buildAnalyzePrompt(keyword: string, brandName: string, brandUrl: string, refs: SearchResult[], brandDescription = '', writingGuide = '', override = '', brandSiteContent = '') {
  const refBlock = refs.length > 0
    ? `以下是搜尋「${keyword}」取得的競品參考資料，請在分析時參考這些頁面：\n\n${refs.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content.slice(0, 300)}`).join('\n\n')}\n\n---\n\n`
    : '';
  const guideBlock = writingGuide.trim() ? `\n\n全域寫作指引（必須遵守）：\n${writingGuide.trim()}` : '';
  const brandSiteBlock = brandSiteContent.trim()
    ? `\n\n【品牌網站實際內容（以此為準，不得超出範圍）】\n${brandSiteContent.trim()}`
    : '';
  const body = override.trim() || PROMPT_DEFAULTS.analyze;
  return `${refBlock}${body}

關鍵字：${keyword}
品牌名稱：${brandName.trim() || '（未提供）'}
品牌網址：${brandUrl.trim() || '（未提供）'}${brandDescription.trim() ? `\n品牌描述：${brandDescription.trim()}` : ''}${brandSiteBlock}${guideBlock}

請進行 SEO 寫作控制表與標題提案。輸出完畢後請立即停止，不要自行產生文章架構、前言、段落或任何正文內容，等待下一步指令。`;
}

function buildOutlinePrompt(title: string, writingGuide = '', override = '') {
  const guideBlock = writingGuide.trim() ? `\n\n全域寫作指引（架構必須符合）：\n${writingGuide.trim()}` : '';
  const body = override.trim() || PROMPT_DEFAULTS.outline;
  return `我選擇：${title}

${body}${guideBlock}

請直接輸出架構，格式為 ## H2 和 ### H3，第一行從 ## 開始，不要有任何前言或說明。`;
}

function buildSectionPromptByStyle(sec: Section, outlineText: string, style: PromptStyle, completedContext = '', keyword = ''): string {
  const h3Tables = sec.h3Tables ?? sec.h3s.map(() => false);
  const h3Lists = sec.h3Lists ?? sec.h3s.map(() => false);
  const showH3FormatHints = style === 'info';
  const h3Block = sec.h3s.length > 0
    ? `\n\n這個 H2 小節開頭可以先用 1–2 句話簡短帶出「${sec.h2}」這個小節本身要討論什麼，這只是這個小節自己的開場破題，不是整篇文章的前言（文章的前言是另一個獨立的 H2，已經寫過了，這裡不要用導言語氣、不要重複前言說過的內容，也不要再帶讀者進入整篇文章）。開場之後依序包含以下 H3 子節，每個 H3 請使用 ### 標題格式獨立成一小節，不可省略或合併：\n${sec.h3s.map((h, i) => {
        const hints: string[] = [];
        if (showH3FormatHints && h3Tables[i]) hints.push('需加入一個 Markdown 表格整理重點資訊，表格是額外補充，文字說明仍要依篇幅要求完整撰寫');
        if (showH3FormatHints && h3Lists[i]) hints.push('改用 Markdown 條列格式呈現，每一點獨立一行並以 "- " 開頭（例如：- **粗體名稱**：一句說明），不要寫成大段散文');
        return `- ### ${h}${hints.length > 0 ? `（${hints.join('；')}）` : ''}`;
      }).join('\n')}`
    : '';
  const tableTitles = showH3FormatHints ? sec.h3s.filter((_, i) => h3Tables[i]) : [];
  const listTitles = showH3FormatHints ? sec.h3s.filter((_, i) => h3Lists[i]) : [];
  const formatReminder = (tableTitles.length > 0 || listTitles.length > 0)
    ? `\n\n格式提醒（務必逐一檢查，不可遺漏）：${tableTitles.length > 0 ? `\n・以下每個 H3 子節都必須各自包含一個獨立的 Markdown 表格，不可只在其中一個出現：${tableTitles.map(t => `「${t}」`).join('、')}` : ''}${listTitles.length > 0 ? `\n・以下每個 H3 子節都必須改用 Markdown 條列格式（每一點獨立一行並以 "- " 開頭），不可寫成散文段落：${listTitles.map(t => `「${t}」`).join('、')}` : ''}`
    : '';
  const prevBlock = completedContext.trim()
    ? `【已完成段落參考 — 避免重複說明相同內容，據此調整切入角度】\n${completedContext.trim()}\n\n`
    : '';
  const h3Depths = sec.h3Depths ?? sec.h3s.map(() => sec.contentDepth);
  const hasPerH3Depth = sec.h3s.length > 0 && h3Depths.length === sec.h3s.length;
  const depthBlock = hasPerH3Depth
    ? `\n\n各 H3 子節篇幅要求（依序對應，各自獨立）：\n${sec.h3s.map((h, i) => {
        const d = h3Depths[i] ?? 'standard';
        const listReminder = showH3FormatHints && !h3Lists[i] ? `\n${NO_AUTO_LIST_REMINDER}` : '';
        const tableReminder = showH3FormatHints && h3Tables[i] ? `\n${TABLE_WORDCOUNT_REMINDER}` : '';
        return `・### ${h}：${DEPTH_LABELS[d]}\n${DEPTH_INSTRUCTIONS[d].split('\n').slice(1).join('\n')}${listReminder}${tableReminder}`;
      }).join('\n\n')}${formatReminder}`
    : `\n\n篇幅要求：${DEPTH_INSTRUCTIONS[sec.contentDepth]}${formatReminder}`;
  const h3FormatReminder = sec.h3s.length > 0 ? '，H3 子節一律使用 ### 標題格式' : '';
  const header = `${prevBlock}完整文章架構如下：\n${outlineText}\n\n現在請只撰寫「${sec.h2}」這個段落的正文內容。${h3Block}\n\n`;
  const footer = `${depthBlock}\n\n從 ## 標題開始輸出${h3FormatReminder}，只輸出該段落正文，不要加任何說明或備註。`;

  if (style === 'scene') {
    return `${header}這是文章的「前言」，需要快速破題、簡潔有力。

寫法要求：全段只有連續段落，不分 H3，不加條列。長度嚴格控制在 100–150 字以內（3–5 句話）。第一句直接破題，點出讀者的核心需求或問題，不要用故事感或情境感開場。文章關鍵字是「${keyword}」，必須讓全部關鍵字都自然出現在這段裡，不必連在一起組成完整詞組——例如關鍵字「皮膚保養」可以拆開寫成「皮膚...保養很重要」，只要語意上涵蓋到每個關鍵字即可，不要硬塞。語氣直接通順，不說廢話。繁體中文，語氣簡潔專業。\n\n從 ## 標題開始輸出，只輸出前言正文，不要加任何說明或備註。`;
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

寫法要求：2–4 句話整合全文核心重點，不重複前面已詳細說明的內容，不要只是條列各段標題。文章關鍵字是「${keyword}」，必須讓全部關鍵字都自然出現在這段裡，不必連在一起組成完整詞組，只要語意上涵蓋到每個關鍵字即可，不要硬塞。若有品牌，可自然引導讀者下一步（如：諮詢、了解更多），語氣收尾有力但不強推。繁體中文，簡潔有力。${footer}`;
  }

  // 預設 info 風格
  return `${header}這個段落要提供清楚、實用的資訊，讓讀者讀完真的有收穫。

寫法要求：以散文段落寫作為主。若需要條列，格式必須是「**粗體名稱**：一句說明」，不要用普通的 - 條列符號${listTitles.length > 0 ? `（但以下被標記為條列格式的 H3 子節例外，必須改用 "- " 開頭的 Markdown 條列：${listTitles.map(t => `「${t}」`).join('、')}）` : ''}。每一句都要有資訊量，刪掉廢話和沒意義的過場句。若有需要引用文獻、法規、研究數據，自然融入段落並附來源。繁體中文，風格清楚自然。${footer}`;
}

const QUALITY_RULES = `內容品質規則（每句都要符合）：
- 每句必須有新資訊或判斷，不重複說法，不加空泛轉場句。
- 禁用「先否定再肯定」句型：不是A而是B、不只是A更是B、不應該A而應該B。
- 格式依內容性質：說明型→段落；條件/注意→項目符號（**粗體**：說明）；步驟→編號；比較→表格。若該段落的具體指示明確要求改用 "- " 開頭的 Markdown 條列格式，則以該指示為準，不適用本條的粗體項目符號慣例。`;

function buildSystemMessage(sectionOverride: string, brandDescription: string, clientWritingRules: string, writingGuide: string, authorityRefs: SearchResult[] = []): string {
  const parts: string[] = [];
  parts.push(`【行為規範 — 最優先執行】
・直接輸出段落內容，絕對不得向使用者提問、列出選項方案、要求使用者做決定。
・規則之間有衝突時，自行判斷最合理的詮釋方式後直接撰寫，不得停下來說明衝突。
・若某條規則在特定段落難以完全執行，盡量融入其精神，不必逐字強制套用。`);
  if (sectionOverride.trim()) {
    parts.push(`【使用者指定寫作規則 — 高優先，靈活詮釋其精神融入內容】\n${sectionOverride.trim()}`);
  }
  if (brandDescription.trim()) {
    parts.push(`【品牌背景資訊 — 只作為事實依據，不得捏造超出此範圍的內容】\n${brandDescription.trim()}`);
  }
  if (clientWritingRules.trim()) {
    parts.push(`【客戶寫作風格 — 高優先，若與使用者指定規則無衝突則一起遵守】\n${clientWritingRules.trim()}`);
  }
  if (authorityRefs.length > 0) {
    const refList = authorityRefs
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 200)}`)
      .join('\n\n');
    parts.push(`【可引用的權威來源】若段落中提到具體數據、研究結論或事實宣稱，請在該句子的關鍵詞上用 Markdown 超連結格式標注來源，例如：[研究指出 8 週後症狀改善](https://...)。引用以下清單中的 URL，若無對應來源請勿捏造連結。\n${refList}`);
  }
  const guideText = [writingGuide.trim(), QUALITY_RULES].filter(Boolean).join('\n\n');
  parts.push(`【全域寫作規則】\n${guideText}`);
  return parts.join('\n\n');
}

// 小模型在長對話下會忽略 system message 的風格規則，必須把規則原文重申在最後一則訊息結尾
function buildPriorityReminder(sectionOverride: string, clientWritingRules: string, authorityRefs: SearchResult[] = []): string {
  const parts: string[] = [];
  if (sectionOverride.trim() || clientWritingRules.trim()) {
    parts.push('【寫作規則重申 — 直接輸出，不得提問或列選項】');
    if (clientWritingRules.trim()) parts.push(`客戶寫作風格：\n${clientWritingRules.trim()}`);
    if (sectionOverride.trim()) parts.push(`使用者指定寫作規則（盡量融入其精神，難以執行時自行判斷最合理的方式）：\n${sectionOverride.trim()}`);
  }
  if (authorityRefs.length > 0) {
    parts.push(`【引用來源提醒 — 務必執行，不是可選】這個段落如果提到具體數據、研究結論、統計數字或專業判斷依據，必須挑至少 1 處用 Markdown 超連結格式標注來源，不可整段毫無連結。可用來源：\n${authorityRefs.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n')}`);
  }
  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

// CommonMark 不解析「**注意：**內容」這種粗體內含結尾標點又緊接文字的寫法（** 會原樣顯示），把標點移出粗體
function normalizeBoldPunctuation(md: string): string {
  return md.replace(/\*\*([^*\n]+?)([：:，。、；！？]+)\*\*(?=\S)/g, '**$1**$2');
}

function buildReviewSystemMessage(opts: {
  writingGuide: string; clientWritingRules: string;
  sectionOverride: string; brandDescription: string;
}): string {
  const parts: string[] = [];

  parts.push(`你是一位專業的 SEO 文章審稿員，專門審查繁體中文內容行銷文章。每條修改建議只針對一句話，不改整段。

【文字品質】
・刪除低資訊句：每句必須帶新資訊，不用不同說法重複同一件事
・禁用「先否定、再肯定」句型：不是A而是B／不只A更是B／不應該A而應該B
・避免低資訊連接詞開頭：「然而」「換句話說」「這樣」「這件事」「這一點」
・錯誤做法的提醒順序：先給正確判斷標準，再簡短補充風險；不要先講錯誤

【E-E-A-T】
・文章中以 [文字](URL) 格式標注的超連結代表已引用來源，審稿時視為具備可查證依據，不需要建議補充來源
・數據、研究、法規若沒有附超連結，才建議補充來源或改為保守說法
・術語說明層次清楚：概念 → 判斷依據 → 實作，不可跳過關鍵步驟
・效果宣稱保守，不得出現「保證」「100%」「一定」等絕對用語
・可建議補充具體案例、操作情境或參考文獻

【其他】
・品牌相關宣稱不得超出品牌描述範圍，不捏造成效或數據
・H3 小節之間不可重複說明相同概念`);

  if (opts.brandDescription.trim())
    parts.push(`【品牌背景資訊 — 宣稱必須在此範圍內】\n${opts.brandDescription.trim()}`);
  if (opts.clientWritingRules.trim())
    parts.push(`【客戶寫作風格規則】\n${opts.clientWritingRules.trim()}`);
  if (opts.sectionOverride.trim())
    parts.push(`【使用者指定寫作規則 — 最高優先】\n${opts.sectionOverride.trim()}`);
  return parts.join('\n\n');
}

function buildViolationReviewSystemMessage(opts: {
  clientWritingRules: string; brandDescription: string; bannedWords: string;
}): string {
  const parts: string[] = [];
  parts.push(`你是一位專業的廣告合規審稿員，專門檢查繁體中文內容行銷文章是否違反客戶禁用詞、寫文規範或品牌宣稱範圍。只挑出明確違規的地方，不要對文字品質、語氣、結構、SEO 等非違規問題提供建議。`);
  if (opts.bannedWords.trim())
    parts.push(`【禁止使用的詞彙或宣稱 — 文章中若出現以下詞彙、或語意相近的宣稱，一律視為違規】\n${opts.bannedWords.trim()}`);
  if (opts.clientWritingRules.trim())
    parts.push(`【寫文規範 — 違反視為違規】\n${opts.clientWritingRules.trim()}`);
  if (opts.brandDescription.trim())
    parts.push(`【品牌背景資訊 — 宣稱不得超出此範圍，超出視為違規】\n${opts.brandDescription.trim()}`);
  return parts.join('\n\n');
}

function buildViolationReviewPrompt(article: string, opts: { title: string; keyword: string }): string {
  return `文章標題：${opts.title}
目標關鍵字：${opts.keyword}

待審稿文章：

${article}

---

請逐字檢查文章，找出所有違反禁用詞、寫文規範或品牌背景範圍的地方，不可遺漏。若完全沒有違規，請只輸出「整體評分：10/10 — 未發現違規」，不要輸出任何建議區塊。否則請先輸出「整體評分：X/10 — 說明」（依違規嚴重程度與數量評分），再逐條列出違規，每條格式如下：

---SUGGESTION---
SECTION: （問題所在的 H2 段落名稱）
ISSUE: （違反了哪一條禁詞或規範，具體說明）
OLD: （從文章中精確複製違規的詞句本身；若是局部刪除（不是整句刪除），必須把刪掉後會變得多餘或斷裂的相鄰標點符號、連接詞一併包含進來，例如前後的「、」「，」「和」「以及」「並」等，不可只複製違規詞本身；必須與文章一字不差）
NEW: （建議替換的安全用詞或調整後的銜接文字，確保替換或刪除後語句仍然通順完整、不留斷裂標點；若整句都需要刪除則此欄完全空白）
---END---

重要規定（違反則建議無效）：
1. OLD 只複製真正違規的詞句本身，不要包含不相關的上下文；但若是局部刪除，必須照上面規則把多餘標點、連接詞也納入 OLD 範圍
2. OLD 必須直接從文章複製，系統用字串比對套用，不符就無法生效
3. 只挑出真正違規的地方，不要報告文字品質、語氣、結構等非違規問題
4. 局部刪除違規詞時，務必確認刪除/替換後語句通順，不留下多餘或斷裂的標點符號
5. 繁體中文輸出`;
}

function buildReviewPrompt(article: string, opts: { title: string; keyword: string }): string {
  return `文章標題：${opts.title}
目標關鍵字：${opts.keyword}

待審稿文章：

${article}

---

請先輸出整體評分（格式：「整體評分：X/10 — 說明」），再挑出最重要的問題，最多輸出 15 條修改建議（優先選對品質影響最大的，微小措辭問題請忽略）。每條建議輸出以下格式區塊：

---SUGGESTION---
SECTION: （問題所在的 H2 段落名稱）
ISSUE: （一句話說明問題）
OLD: （從文章中精確複製需要改動的最短文字：若只改一個詞或片語，就只複製那個詞或片語；若需要改整句，就複製到句號/問號/驚嘆號為止，不得超過一個句子；絕對不可引用多句或整段；不可含 ## / ### 標題行；必須與文章一字不差）
NEW: （修改後的替換文字，長度與 OLD 對應；若整句要刪除則此欄完全空白）
---END---

重要規定（違反則建議無效）：
1. OLD 最多一句話，若一段有多個問題請拆成多條建議各改一句
2. OLD 禁止引用整段落或跨句引用
3. OLD 必須直接從文章複製，系統用字串比對套用，不符就無法生效
4. 若刪除整句則 NEW 欄留空；繁體中文輸出`;
}

// GPT 審「目錄架構」：聚焦結構調整、把寫手需求當最高優先，回傳一份完整新架構（前端再做整份 diff）
function buildOutlineReviewPrompt(outline: string, opts: { title: string; instruction: string; structureRules: string; writingGuide: string }): string {
  return `你是一位資深 SEO 內容主編，正在審核另一個 AI（Gemini）排的「文章目錄架構」。

文章標題：${opts.title}

目前的目錄架構（Markdown，## 是 H2、### 是 H3）：

${outline}

---

【這篇文章的固定架構規則 — 你改完的新架構也必須完全符合，不可破壞】
${opts.structureRules.trim()}
${opts.writingGuide.trim() ? `\n【全域寫作指引 — 架構必須符合】\n${opts.writingGuide.trim()}\n` : ''}
---

${opts.instruction.trim()
  ? `【寫手的指定需求 — 最高優先，必須完全照做，不可忽略】\n${opts.instruction.trim()}\n\n`
  : ''}你的審稿重點是「架構層級」，不是字句潤飾。請只從以下角度調整：
- 新增、刪除、合併、拆分 H2／H3 段落
- 調整段落順序，讓邏輯符合讀者決策流程（概念 → 判斷 → 注意事項 → 比較）
- 調整 H3 的歸屬與層級
${opts.instruction.trim()
  ? '- 把上面「寫手的指定需求」完整落實到架構：例如指定某個主題要獨立成一個 H2 並完整說明，你就必須新增該 H2，並在底下補上對應的 H3 小節把它展開'
  : '- 依搜尋意圖補強缺漏的重要段落'}

【不要做的事】不要只改標題用字、不要做純文字潤飾、不要無意義地換句話說。如果架構本身沒問題且寫手需求已滿足，可以只做最小調整。另外務必保留上面的固定架構規則：前言、常見問題 FAQ（含固定題數）、總結等段落的位置與格式都不可破壞或刪除，新增段落請插在中間核心內容區。

輸出格式（嚴格遵守）：
先用 2～4 句話說明你做了哪些「結構調整」以及為什麼（不要逐行解釋），接著「從第一個 ## 開始」輸出完整的新目錄架構，維持 ## H2 / ### H3 格式、不要出現 H4、架構之後不要再有任何說明文字。`;
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
        promptStyle: 'info',
        generateTable: /比較|差異|優缺點|選購指南|推薦/.test(h2text),
        isEditing: false,
        revisePrompt: '',
        reviseQuotes: [],
        contentDepth: 'standard',
        h3Depths: [],
        h3Tables: [],
        h3Lists: [],
      };
    } else if (h3 && cur) {
      cur.h3s.push(h3[1].trim());
    }
  }
  if (cur) sections.push(cur);
  const total = sections.length;
  return sections.map((s, i) => ({
    ...s,
    promptStyle: detectStyle(s.h2, i, total),
    h3Depths: s.h3s.map(() => 'standard' as ContentDepth),
    h3Tables: s.h3s.map(() => s.generateTable),
    h3Lists: s.h3s.map(() => false),
  }));
}

// ── Stream ────────────────────────────────────────────────────────────

// 文章架構環節：Gemini 主筆出稿、GPT 審稿顧問（共用同一把 OpenRouter key，只換 model）
const OUTLINE_MODEL = 'google/gemini-2.5-flash';
const REVIEW_MODEL = 'openai/gpt-4o';
// 玩偶下方可切換的模型清單（共用同一把 OpenRouter key）
const GEMINI_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
];
const GPT_MODELS = [
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'openai/gpt-4.1', label: 'GPT-4.1' },
  { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini' },
];
// 玩偶台詞
const GEMINI_OUTLINE_LINE = '架構初稿排好了！我照 SEO 結構安排，幫你看看順不順～';
const GPT_IDLE_LINE = '要我審稿嗎？在下面打需求或直接按按鈕，我幫你抓架構問題 👀';

async function streamAPI(messages: Message[], onChunk: (t: string) => void, model?: string) {
  const res = await fetch('/api/writer/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
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

function Err({ msg, onDismiss }: { msg: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
      <span className="shrink-0 mt-0.5">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-900 mb-1 text-xs">AI 無法執行此指令</p>
        <p className="text-xs leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{msg}</p>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-amber-400 hover:text-amber-700 text-base leading-none mt-0.5">×</button>
      )}
    </div>
  );
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
    { key: 'review', label: 'AI 校稿' },
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
type BrandProfileOption = { gsc_client_id: number; brand_url: string; brand_description: string; writing_rules: string; banned_words: string };

// ── Stage 1 ───────────────────────────────────────────────────────────

function Stage1({ keyword, vendor, writingGuide, analyzeOverride, onSaveAnalyzeOverride, onDone }: {
  keyword: string; vendor: string; writingGuide: string;
  analyzeOverride: string;
  onSaveAnalyzeOverride: (text: string | null) => void;
  onDone: (analyzeMsg: string, analysisResult: string, title: string, clientWritingRules: string, brandDescription: string, bannedWords: string) => void;
}) {
  const [brandName, setBrandName] = useState(vendor);
  const [brandUrl, setBrandUrl] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [clientWritingRules, setClientWritingRules] = useState('');
  const [bannedWords, setBannedWords] = useState('');
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
    if (id === null) { setBrandName(vendor); setBrandUrl(''); setBrandDescription(''); setClientWritingRules(''); setBannedWords(''); return; }
    const c = gscClients.find(x => x.id === id);
    if (c) {
      setBrandName(c.name);
      fetch(`/api/writer/brand-profile?clientId=${id}`)
        .then(r => r.json())
        .then((p: BrandProfileOption) => {
          setBrandUrl(p.brand_url ?? '');
          setBrandDescription(p.brand_description ?? '');
          setClientWritingRules(p.writing_rules ?? '');
          setBannedWords(p.banned_words ?? '');
        })
        .catch(() => {});
    }
  }

  async function fetchSearch(): Promise<SearchResult[]> {
    setSearching(true);
    setSearchPage(0);
    try {
      const res = await fetch(`/api/writer/search?keyword=${encodeURIComponent(keyword)}`);
      const refs = res.ok ? ((await res.json()) as { results?: SearchResult[] }).results ?? [] : [];
      setSearchResults(refs);
      return refs;
    } catch { /* 不阻斷 */ } finally { setSearching(false); }
    return [];
  }

  async function run() {
    setResult(''); setError(''); setTitles([]); setSelectedTitle('');
    setSearchResults([]);

    const [refs, brandSiteContent, freshSettings] = await Promise.all([
      fetchSearch(),
      brandUrl.trim()
        ? fetch(`/api/writer/brand-crawl?url=${encodeURIComponent(brandUrl.trim())}`)
            .then(r => r.json())
            .then((d: { content?: string }) => d.content ?? '')
            .catch(() => '')
        : Promise.resolve(''),
      fetch('/api/writer/settings').then(r => r.json()).catch(() => ({} as { writing_guide?: string })),
    ]);
    const freshGuide = (freshSettings as { writing_guide?: string }).writing_guide ?? '';

    const combinedGuide = [freshGuide, clientWritingRules].filter(Boolean).join('\n\n');
    const msg = buildAnalyzePrompt(keyword, brandName, brandUrl, refs, brandDescription, combinedGuide, analyzeOverride, brandSiteContent);
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
            <button onClick={() => onDone(analyzeMsg.current, result, selectedTitle, clientWritingRules, brandDescription, bannedWords)}
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
        className={`fixed right-0 top-[57%] -translate-y-1/2 z-40 bg-amber-400 hover:bg-amber-500 text-white py-4 px-2 rounded-l-xl shadow-lg transition-all duration-200 ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
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

  // 玩偶下方可切換的模型
  const [outlineModel, setOutlineModel] = useState(OUTLINE_MODEL);
  const [reviewModel, setReviewModel] = useState(REVIEW_MODEL);

  // GPT 架構審稿：回傳一份完整新架構，前端做整份 diff 對照後可一鍵採用
  const [reviewInstruction, setReviewInstruction] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [outlineEval, setOutlineEval] = useState('');
  const [suggestedOutline, setSuggestedOutline] = useState<string | null>(null);
  // OutlineEditor 內部 state 只在掛載時初始化，採用新架構後用這個 key 強制重新掛載以反映新值
  const [editorKey, setEditorKey] = useState(0);

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
      ], chunk => { if (runId.current === id) setOutline(r => r + chunk); }, outlineModel);
    } catch (e) { if (runId.current === id) setError(e instanceof Error ? e.message : '產生架構失敗'); }
    finally { if (runId.current === id) setOutlining(false); }
  }

  function confirm() {
    const sections = parseOutline(outline);
    if (sections.length === 0) return;
    onDone(outlineMsg.current, outline, sections);
  }

  // 請 GPT 審稿：聚焦架構調整，回傳「說明 + 完整新架構」，前端再做整份 diff
  async function handleReview() {
    if (!outline.trim()) return;
    setReviewing(true); setError(''); setOutlineEval(''); setSuggestedOutline(null);
    let buf = '';
    // 用第一個出現在行首的 ## 當分界：之前是說明、之後是新架構（不依賴特殊標記，較穩）
    const splitEval = (t: string) => {
      const idx = t.search(/^##\s/m);
      return idx >= 0 ? t.slice(0, idx).trim() : t.trim();
    };
    try {
      const structureRules = outlineOverride.trim() || PROMPT_DEFAULTS.outline;
      // 把固定架構規則放進 system message，比塞在 user 內文更有約束力
      const sysMsg = `你是一位資深 SEO 內容主編。改寫文章目錄架構時有一條不可違反的鐵則：新架構的整體骨架（H2 段落的種類與順序）必須完全遵守這篇文章既定的「固定架構規則」，只能在中間核心內容區做增刪或調整；前言、常見問題 FAQ（含固定題數）、總結等固定段落的位置與格式一律保留，不可刪除或搬動。

固定架構規則：
${structureRules}${writingGuide.trim() ? `\n\n全域寫作指引：\n${writingGuide.trim()}` : ''}`;
      const prompt = buildOutlineReviewPrompt(outline, {
        title,
        instruction: reviewInstruction,
        structureRules,
        writingGuide,
      });
      await streamAPI([
        { role: 'system', content: sysMsg },
        { role: 'user', content: prompt },
      ], chunk => {
        buf += chunk;
        setOutlineEval(splitEval(buf)); // 說明部分即時冒出來
      }, reviewModel);
      const idx = buf.search(/^##\s/m);
      const newOutline = idx >= 0 ? buf.slice(idx).trim() : '';
      setOutlineEval(splitEval(buf) || '我從架構角度調整了一下。');
      if (newOutline) setSuggestedOutline(newOutline);
      else setError('GPT 沒有回傳新的架構，請再按一次或把需求講得更具體。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '審稿失敗');
    } finally {
      setReviewing(false);
    }
  }

  // 採用 GPT 的整份新架構（覆蓋目錄編輯框，並強制編輯器重新掛載以顯示新值）
  function handleAdoptOutline() {
    if (!suggestedOutline) return;
    setOutline(suggestedOutline);
    setEditorKey(k => k + 1);
    setSuggestedOutline(null);
    setOutlineEval(c => (c ? `${c}（已採用 ✅）` : '已採用 ✅'));
  }

  return (
    <div className="flex justify-center items-start gap-6">
      {/* 左玩偶欄：Gemini（架構主筆）＋ 選模型 */}
      <aside className="hidden lg:flex flex-col items-center gap-2 w-52 shrink-0 sticky top-6">
        <div className="relative w-full bg-blue-50 border border-blue-200 rounded-2xl p-3 text-xs text-blue-800 leading-relaxed shadow-sm">
          {outlining ? '讓我想想架構怎麼排…' : GEMINI_OUTLINE_LINE}
          <div className="absolute -bottom-2 left-8 w-3 h-3 bg-blue-50 border-b border-r border-blue-200 rotate-45" />
        </div>
        <div className={`text-5xl ${outlining ? 'animate-bounce' : ''}`}>🤖</div>
        <span className="text-xs font-semibold text-blue-600">Gemini</span>
        <span className="text-[10px] text-gray-400">架構主筆</span>
        <select
          value={outlineModel}
          onChange={e => setOutlineModel(e.target.value)}
          className="w-full mt-1 border border-blue-200 rounded-lg px-2 py-1.5 text-xs bg-white text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 text-center">換模型後按「重新產生」</p>
      </aside>

      {/* 中間：主內容 */}
      <div className="w-full max-w-2xl space-y-5">
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
          <OutlineEditor key={editorKey} value={outline} onChange={setOutline} />
        </div>
      )}

      {/* GPT 架構審稿：整份新架構 vs 舊架構的紅綠 diff，一鍵採用或放棄 */}
      {(reviewing || outlineEval || suggestedOutline) && (
        <div className="space-y-2.5 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
            🦉 GPT 架構審稿{reviewing && <Spinner />}
          </div>
          {outlineEval && (
            <p className="text-sm text-gray-600 bg-green-50 rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">{outlineEval}</p>
          )}
          {suggestedOutline && (
            <>
              <p className="text-xs text-gray-400">
                建議的新架構（<span className="text-green-700">綠＝新增</span>、<span className="text-red-600">紅＝刪除</span>）：
              </p>
              <div className="text-sm rounded-lg bg-gray-50 px-3 py-2.5 leading-relaxed font-mono whitespace-pre-wrap border border-gray-100 max-h-80 overflow-y-auto">
                {computeDiff(outline, suggestedOutline).map((p, i) =>
                  p.type === 'del' ? <span key={i} className="bg-red-100 text-red-600 line-through">{p.text}</span>
                  : p.type === 'add' ? <span key={i} className="bg-green-100 text-green-700">{p.text}</span>
                  : <span key={i}>{p.text}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleAdoptOutline}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
                  採用這份架構
                </button>
                <button onClick={() => setSuggestedOutline(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors">
                  放棄
                </button>
              </div>
            </>
          )}
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

      {/* 右玩偶欄：GPT（審稿顧問）＋ 選模型 ＋ 需求輸入 ＋ 審稿 */}
      <aside className="hidden lg:flex flex-col items-center gap-2 w-56 shrink-0 sticky top-6">
        <div className="relative w-full bg-green-50 border border-green-200 rounded-2xl p-3 text-xs text-green-800 leading-relaxed shadow-sm min-h-[3rem]">
          {reviewing
            ? '讓我從架構看看…🤔'
            : suggestedOutline
              ? '我調好一版架構了，看中間的對照 👇'
              : outlineEval
                ? '我看過了，架構我覺得 OK 👍'
                : GPT_IDLE_LINE}
          <div className="absolute -bottom-2 right-8 w-3 h-3 bg-green-50 border-b border-r border-green-200 rotate-45" />
        </div>
        <div className={`text-5xl ${reviewing ? 'animate-bounce' : ''}`}>🦉</div>
        <span className="text-xs font-semibold text-green-600">GPT</span>
        <span className="text-[10px] text-gray-400">審稿顧問</span>
        <select
          value={reviewModel}
          onChange={e => setReviewModel(e.target.value)}
          className="w-full mt-1 border border-green-200 rounded-lg px-2 py-1.5 text-xs bg-white text-green-800 focus:outline-none focus:ring-2 focus:ring-green-300"
        >
          {GPT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <textarea
          value={reviewInstruction}
          onChange={e => setReviewInstruction(e.target.value)}
          placeholder="想怎麼調架構？例：基礎臉部按摩步驟要獨立成一個 H2 完整說明（留空也可）"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
        />
        <button
          onClick={handleReview}
          disabled={reviewing || !outline.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {reviewing && <Spinner />}{reviewing ? '審稿中…' : '🦉 請 GPT 審稿'}
        </button>
        <p className="text-[10px] text-gray-400 text-center">審稿建議會出現在中間目錄下方</p>
      </aside>
    </div>
  );
}

// ── Stage 3 ───────────────────────────────────────────────────────────

function Stage3({ title, keyword, analyzeMsg, analysisResult, outlineMsg, outlineResult, initSections, writingGuide, clientWritingRules, brandDescription, bannedWords, sectionOverride, onSaveSectionOverride, onBack, onNext }: {
  title: string; keyword: string;
  analyzeMsg: string; analysisResult: string;
  outlineMsg: string; outlineResult: string;
  initSections: Section[]; writingGuide: string;
  clientWritingRules: string;
  brandDescription: string;
  bannedWords: string;
  sectionOverride: string;
  onSaveSectionOverride: (text: string | null) => void;
  onBack: () => void;
  onNext: (sections: Section[]) => void;
}) {
  const [sections, setSections] = useState<Section[]>(initSections);
  const [authorityRefs, setAuthorityRefs] = useState<SearchResult[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [showRefs, setShowRefs] = useState(false);
  const [refsContent, setRefsContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [showSectionPromptModal, setShowSectionPromptModal] = useState(false);
  const [showStructure, setShowStructure] = useState(false);
  const [atMenuSecId, setAtMenuSecId] = useState<string | null>(null);

  useEffect(() => {
    setRefsLoading(true);
    fetch(`/api/writer/search?keyword=${encodeURIComponent(keyword)}&type=authority`)
      .then(r => r.json())
      .then((data: { results?: SearchResult[] }) => {
        const refs = data.results ?? [];
        setAuthorityRefs(refs);
        if (refs.length > 0) {
          setRefsContent(prev => prev || refs.map((r, i) => `${i + 1}. [${r.title}](${r.url})`).join('\n'));
        }
      })
      .catch(() => {})
      .finally(() => setRefsLoading(false));
  }, [keyword]);

  // 撰寫過程持續存草稿，避免在這個階段重新整理就把已產生的段落內容弄丟
  useEffect(() => {
    const t = setTimeout(() => {
      saveDraft({ keyword, selectedTitle: title, analyzeMsg, analysisResult, outlineMsg, outlineResult, sections, clientWritingRules, brandDescription, bannedWords });
    }, 800);
    return () => clearTimeout(t);
  }, [sections, keyword, title, analyzeMsg, analysisResult, outlineMsg, outlineResult, clientWritingRules, brandDescription, bannedWords]);

  function getBlockItems(content: string): { label: string; full: string }[] {
    const items: { label: string; full: string }[] = [];
    const lines = content.split('\n');
    let buf: string[] = [];
    function flushBuf() {
      const text = buf.join('\n').trim();
      if (text) items.push({ label: text.slice(0, 32) + (text.length > 32 ? '…' : ''), full: text });
      buf = [];
    }
    for (const line of lines) {
      if (/^#{1,2}\s/.test(line)) continue;
      if (/^###\s+(.+)/.test(line)) {
        flushBuf();
        const h3 = line.replace(/^###\s+/, '').trim();
        items.push({ label: `H3 ${h3}`, full: h3 });
      } else if (line.trim()) {
        buf.push(line);
      } else {
        flushBuf();
      }
    }
    flushBuf();
    return items;
  }

  function insertSectionAfter(afterIdx: number) {
    const newSec: Section = {
      id: Math.random().toString(36).slice(2),
      h2: '新段落',
      h3s: [],
      content: '',
      generating: false,
      promptStyle: 'info',
      generateTable: false,
      isEditing: false,
      revisePrompt: '',
      reviseQuotes: [],
      contentDepth: 'standard',
      h3Depths: [],
      h3Tables: [],
      h3Lists: [],
    };
    setSections(prev => {
      const next = [...prev];
      next.splice(afterIdx + 1, 0, newSec);
      return next;
    });
  }

  const outlineText = sections.map(s => `## ${s.h2}` + (s.h3s.length ? '\n' + s.h3s.map(h => `### ${h}`).join('\n') : '')).join('\n\n');
  const articleBody = sections.filter(s => s.content.trim()).map(s => s.content.trim()).join('\n\n');
  const refsBlock = refsContent.trim() ? `\n\n## 參考資料\n\n${refsContent.trim()}` : '';
  const fullArticle = articleBody ? articleBody + refsBlock : '';
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
      const basePrompt = buildSectionPromptByStyle(sec, outlineText, sec.promptStyle, completedContext, keyword);
      const usesPerH3Table = sec.h3s.length > 0 && sec.promptStyle === 'info';
      const finalPrompt = (sec.generateTable && !usesPerH3Table
        ? `${basePrompt}\n\n請在段落適當位置加入一個 Markdown 表格，整理此段落的重點資訊或比較項目。${TABLE_WORDCOUNT_REMINDER}`
        : basePrompt) + buildPriorityReminder(sectionOverride, clientWritingRules, authorityRefs);
      const sys = buildSystemMessage(sectionOverride, brandDescription, clientWritingRules, writingGuide, authorityRefs);
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
    const quotes = (sec.reviseQuotes ?? []).filter(q => q.trim());
    const originalContent = sec.content;
    setErrors(prev => ({ ...prev, [id]: '' }));
    const sys = buildSystemMessage(sectionOverride, brandDescription, clientWritingRules, writingGuide, authorityRefs);
    const sysMsg: Message[] = sys ? [{ role: 'system', content: sys }] : [];
    const baseMessages = [
      ...sysMsg,
      { role: 'user' as const, content: analyzeMsg },
      { role: 'assistant' as const, content: analysisResult },
      { role: 'user' as const, content: outlineMsg },
      { role: 'assistant' as const, content: outlineResult },
    ];

    function isAIRefusal(text: string): boolean {
      return /^(我無法|抱歉|很抱歉|無法按照|無法執行|指令內容不明確)/.test(text.trim());
    }

    if (quotes.length > 0) {
      // 目標段落修改：循序逐段 streaming，逐段即時 find-replace
      setSections(prev => prev.map(s => s.id === id
        ? { ...s, generating: true, revisePrompt: '', reviseQuotes: [], isEditing: false }
        : s));
      let currentContent = originalContent;
      try {
        for (const quote of quotes) {
          let replacement = '';
          await streamAPI([
            ...baseMessages,
            { role: 'user', content: `在「${sec.h2}」段落中，以下是需要修改的段落：\n\n「${quote}」\n\n修改指令：${instruction}\n\n請只輸出修改後的這一段文字，使用與原文相同的 Markdown 格式，不要加標題、說明或其他段落。${buildPriorityReminder(sectionOverride, clientWritingRules, authorityRefs)}` },
          ], chunk => {
            replacement += chunk;
            const partial = currentContent.includes(quote)
              ? currentContent.replace(quote, replacement)
              : currentContent + '\n\n' + replacement;
            setSections(prev => prev.map(s => s.id === id ? { ...s, content: partial } : s));
          });
          const trimmed = replacement.trim();
          if (isAIRefusal(trimmed)) {
            setErrors(prev => ({ ...prev, [id]: trimmed }));
            setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: currentContent } : s));
            return;
          }
          currentContent = currentContent.includes(quote)
            ? currentContent.replace(quote, trimmed)
            : currentContent;
        }
        setSections(prev => prev.map(s => s.id === id
          ? { ...s, generating: false, content: normalizeBoldPunctuation(currentContent) }
          : s));
      } catch (e) {
        setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : '修改失敗' }));
        setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: currentContent } : s));
      }
    } else {
      // 全段修改：清空並重新生成（streaming 顯示）
      setSections(prev => prev.map(s => s.id === id
        ? { ...s, generating: true, content: '', revisePrompt: '', reviseQuotes: [], isEditing: false }
        : s));
      let streamed = '';
      try {
        await streamAPI([
          ...baseMessages,
          { role: 'user', content: `以下是「${sec.h2}」段落的現有內容：\n\n${originalContent}\n\n修改指令：${instruction}\n\n請根據修改指令調整段落內容，保持 Markdown 格式，從 ## 標題開始輸出，只輸出修改後的段落，不要加任何說明或備註。${buildPriorityReminder(sectionOverride, clientWritingRules, authorityRefs)}` },
        ], chunk => {
          streamed += chunk;
          setSections(prev => prev.map(s => s.id === id ? { ...s, content: streamed } : s));
        });
        if (isAIRefusal(streamed)) {
          setErrors(prev => ({ ...prev, [id]: streamed.trim() }));
          setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: originalContent } : s));
        } else {
          setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: normalizeBoldPunctuation(streamed) } : s));
        }
      } catch (e) {
        setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : '修改失敗' }));
        setSections(prev => prev.map(s => s.id === id ? { ...s, generating: false, content: originalContent } : s));
      }
    }
  }

  async function generateAll() {
    const pending = sections.filter(s => !s.content.trim() && !s.generating);
    for (const s of pending) {
      await generateSection(s.id);
    }
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
      {/* 結構右側 tab */}
      <button
        onClick={() => setShowStructure(v => !v)}
        className={`fixed right-0 top-[44%] -translate-y-1/2 z-40 bg-gray-600 hover:bg-gray-700 text-white py-4 px-2 rounded-l-xl shadow-lg transition-all duration-200 ${showStructure ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ writingMode: 'vertical-rl' }}
      >
        <span className="text-xs font-semibold tracking-wide">文章結構</span>
      </button>

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
          <button
            onClick={() => setShowRefs(v => !v)}
            title="查看參考資料與數據來源"
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${showRefs ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
          >
            {refsLoading
              ? <><Spinner />參考資料</>
              : <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  參考資料{authorityRefs.length > 0 && ` (${authorityRefs.length})`}
                </>
            }
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

      {showRefs && (
        <div className="border-b border-emerald-100 bg-emerald-50/30 px-6 py-4">
          <p className="text-xs font-medium text-emerald-700 mb-3">寫手出處參考（AI 寫作時可引用，數據標注請對照以下來源）</p>
          {authorityRefs.length === 0 && !refsLoading ? (
            <p className="text-xs text-gray-400">未找到論文或官方資料</p>
          ) : (
            <div className="space-y-3">
              {authorityRefs.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-200 text-emerald-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-emerald-800 hover:underline font-medium block truncate">{r.title}</a>
                    <p className="text-[10px] text-gray-400 truncate mb-1">{r.url}</p>
                    {r.content && (
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{r.content.slice(0, 200)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          {sections.map((sec, i) => (
            <div key={sec.id} id={`sec-${sec.id}`} className={`border rounded-2xl overflow-hidden ${sec.content.trim() ? 'border-emerald-200' : 'border-gray-200'}`}>
              <div className={`flex items-start justify-between gap-4 px-5 py-3.5 ${sec.content.trim() ? 'bg-emerald-50/50' : 'bg-gray-50/50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-500">{sec.h2}</p>
                  {/* H3 列表 + per-H3 深度（僅一般段落需要） */}
                  {sec.h3s.length > 0 && sec.promptStyle === 'info' && (
                    <div className="mt-1.5 space-y-1">
                      {sec.h3s.map((h3, hi) => (
                        <div key={hi} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 truncate max-w-[200px]">↳ {h3}</span>
                          <select
                            value={((sec.h3Depths ?? [])[hi] ?? 'standard') as ContentDepth}
                            onChange={e => setSections(prev => prev.map(s => {
                              if (s.id !== sec.id) return s;
                              const next = [...(s.h3Depths ?? s.h3s.map(() => 'standard' as ContentDepth))];
                              next[hi] = e.target.value as ContentDepth;
                              return { ...s, h3Depths: next };
                            }))}
                            disabled={sec.generating}
                            className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded bg-white text-gray-500 focus:outline-none disabled:opacity-50 flex-shrink-0"
                          >
                            {(Object.keys(DEPTH_LABELS) as ContentDepth[]).map(k => (
                              <option key={k} value={k}>{DEPTH_LABELS[k]}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={sec.generating}
                            onClick={() => setSections(prev => prev.map(s => {
                              if (s.id !== sec.id) return s;
                              const next = [...(s.h3Tables ?? s.h3s.map(() => false))];
                              next[hi] = !next[hi];
                              return { ...s, h3Tables: next };
                            }))}
                            title="這個子節加入比較表格"
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 border rounded transition-colors disabled:opacity-50 flex-shrink-0 ${(sec.h3Tables ?? [])[hi] ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                            表格
                          </button>
                          <button
                            type="button"
                            disabled={sec.generating}
                            onClick={() => setSections(prev => prev.map(s => {
                              if (s.id !== sec.id) return s;
                              const next = [...(s.h3Lists ?? s.h3s.map(() => false))];
                              next[hi] = !next[hi];
                              return { ...s, h3Lists: next };
                            }))}
                            title="這個子節改用條列清單格式"
                            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 border rounded transition-colors disabled:opacity-50 flex-shrink-0 ${(sec.h3Lists ?? [])[hi] ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                            列點
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* 無 H3 的一般段落才顯示 section-level 深度 */}
                  {sec.h3s.length === 0 && sec.promptStyle === 'info' && (
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
                  )}
                  {/* 插入表格（有 H3 的一般段落已改成逐個 H3 控制，這裡不重複顯示） */}
                  {!(sec.h3s.length > 0 && sec.promptStyle === 'info') && (
                  <button
                    type="button"
                    disabled={sec.generating}
                    onClick={() => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, generateTable: !s.generateTable } : s))}
                    title="產生時附加比較表格"
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-colors disabled:opacity-40 ${sec.generateTable ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    表格
                  </button>
                  )}
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


              {errors[sec.id] && (
                <div className="px-5 py-3">
                  <Err msg={errors[sec.id]} onDismiss={() => setErrors(prev => ({ ...prev, [sec.id]: '' }))} />
                </div>
              )}

              {(sec.content.trim() || sec.generating) && (
                <div className="px-5 pt-4 pb-3" id={`sec-content-${sec.id}`}>
                  {sec.generating
                    ? <AutoTA value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        placeholder="撰寫中…"
                        className="px-4 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-white min-h-[140px] focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    : <SectionBlockEditor
                        value={sec.content}
                        onChange={content => setSections(prev => prev.map(s => s.id === sec.id ? { ...s, content } : s))}
                        editable={sec.isEditing}
                        onInsertH2={() => insertSectionAfter(i)}
                      />
                  }
                  {/* AI 修改輸入框 */}
                  {sec.content.trim() && !sec.generating && (
                    <div className="mt-3">
                      {/* 已引用段落顯示（多段）*/}
                      {(sec.reviseQuotes ?? []).length > 0 && (
                        <div className="mb-1.5 flex flex-col gap-1">
                          {(sec.reviseQuotes ?? []).map((q, qi) => (
                            <div key={qi} className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <span className="text-blue-400 text-xs font-bold shrink-0 mt-0.5">@</span>
                              <p className="flex-1 text-xs text-blue-700 line-clamp-2">{q}</p>
                              <button type="button"
                                onClick={() => setSections(prev => prev.map(s => s.id === sec.id
                                  ? { ...s, reviseQuotes: (s.reviseQuotes ?? []).filter((_, j) => j !== qi) }
                                  : s))}
                                className="shrink-0 w-4 h-4 flex items-center justify-center text-blue-300 hover:text-blue-500 text-xs leading-none">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 輸入框 + @ 選單 */}
                      <div className="relative">
                        {atMenuSecId === sec.id && (
                          <div className="absolute bottom-full mb-1.5 left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                            <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">選擇要引用的段落</p>
                            {getBlockItems(sec.content).map((item, k) => (
                              <button key={k} type="button"
                                onClick={() => {
                                  setSections(prev => prev.map(s => s.id === sec.id
                                    ? { ...s, revisePrompt: s.revisePrompt.replace(/@\s*$/, ''), reviseQuotes: [...(s.reviseQuotes ?? []), item.full] }
                                    : s));
                                  setAtMenuSecId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 transition-colors truncate">
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-end gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus-within:border-gray-400 transition-colors">
                          <AutoTA
                            value={sec.revisePrompt}
                            onChange={v => {
                              setSections(prev => prev.map(s => s.id === sec.id ? { ...s, revisePrompt: v } : s));
                              if (/@\s*$/.test(v)) setAtMenuSecId(sec.id);
                              else setAtMenuSecId(null);
                            }}
                            placeholder="輸入修改指令，或 @ 引用段落…"
                            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none resize-none min-h-[36px]"
                          />
                          <button
                            onClick={() => { reviseSection(sec.id); setAtMenuSecId(null); }}
                            disabled={!sec.revisePrompt.trim()}
                            className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            AI 修改
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 參考資料區塊（E-E-A-T，計入正文，置於總結後） */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-gray-50/50">
              <div>
                <p className="text-sm font-semibold text-gray-500">參考資料</p>
                <p className="text-xs text-gray-400 mt-0.5">論文、官方資料、政府公告 — 會附在文章總結後，寫手可自行增刪</p>
              </div>
              {refsLoading && <span className="flex items-center gap-1 text-xs text-gray-400"><Spinner />搜尋中…</span>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <textarea
                value={refsContent}
                onChange={e => setRefsContent(e.target.value)}
                placeholder={'1. [標題](https://...)\n2. [標題](https://...)'}
                rows={Math.max(3, (refsContent.match(/\n/g)?.length ?? 0) + 2)}
                className="w-full text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none leading-relaxed font-mono bg-transparent"
              />
            </div>
          </div>

          {/* 進入 AI 校稿 */}
          {doneCount > 0 && !anyGenerating && (
            <div className="flex justify-end pt-2 pb-1">
              <button
                onClick={() => onNext(sections)}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-sm rounded-xl hover:bg-violet-700 transition-colors"
              >
                進入 AI 校稿 →
              </button>
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

// ── ReviewMd（校稿報告專用輕量 Markdown 渲染）────────────────────────

function inlineNodes(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|✓|✗)/g);
  return parts.map((p, i) => {
    if (p === '✓') return <span key={i} className="text-emerald-600 font-bold">✓</span>;
    if (p === '✗') return <span key={i} className="text-red-500 font-bold">✗</span>;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>;
    return p || null;
  });
}

function ReviewMd({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let listBuf: string[] = [];
  let tableBuf: string[] = [];

  function flushList() {
    if (!listBuf.length) return;
    nodes.push(
      <ul key={nodes.length} className="list-disc pl-5 my-1.5 space-y-0.5">
        {listBuf.map((t, i) => <li key={i} className="text-sm text-gray-700 leading-relaxed">{inlineNodes(t)}</li>)}
      </ul>
    );
    listBuf = [];
  }

  function flushTable() {
    if (!tableBuf.length) return;
    const rows = tableBuf.filter(l => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
    if (rows.length > 0) {
      const parse = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());
      const [header, ...body] = rows;
      nodes.push(
        <div key={nodes.length} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>{parse(header).map((c, i) => <th key={i} className="border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left font-semibold text-gray-700">{inlineNodes(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="even:bg-gray-50/50">
                  {parse(row).map((c, ci) => <td key={ci} className="border border-gray-200 px-2.5 py-1.5 text-gray-600">{inlineNodes(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableBuf = [];
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList();
      tableBuf.push(line);
    } else if (line.startsWith('### ')) {
      flushList(); flushTable();
      nodes.push(<h3 key={nodes.length} className="text-sm font-bold text-gray-900 mt-4 mb-1 pb-0.5 border-b border-gray-200">{inlineNodes(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      flushList(); flushTable();
      nodes.push(<h2 key={nodes.length} className="text-sm font-bold text-gray-900 mt-5 mb-1">{inlineNodes(line.slice(3))}</h2>);
    } else if (/^#+ /.test(line)) {
      /* 跳過 H1/其他標題行 */
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushList(); flushTable();
      listBuf.push(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''));
    } else if (line.trim() === '') {
      flushList(); flushTable();
    } else {
      flushList(); flushTable();
      nodes.push(<p key={nodes.length} className="text-sm text-gray-700 leading-relaxed my-0.5">{inlineNodes(line)}</p>);
    }
  }
  flushList(); flushTable();
  return <div className="space-y-0">{nodes}</div>;
}

// ── Diff / Suggestion helpers ─────────────────────────────────────────

type DiffPart = { type: 'same' | 'del' | 'add'; text: string };
type Suggestion = {
  id: string; section: string; issue: string;
  old: string; new: string;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
};

function computeDiff(a: string, b: string): DiffPart[] {
  const ac = [...a], bc = [...b];
  const m = ac.length, n = bc.length;
  if (m === 0 && n === 0) return [];
  if (m === 0) return [{ type: 'add', text: b }];
  if (n === 0) return [{ type: 'del', text: a }];
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = ac[i-1] === bc[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const raw: { type: 'same' | 'del' | 'add'; ch: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ac[i-1] === bc[j-1]) { raw.unshift({ type: 'same', ch: ac[i-1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { raw.unshift({ type: 'add', ch: bc[j-1] }); j--; }
    else { raw.unshift({ type: 'del', ch: ac[i-1] }); i--; }
  }
  const parts: DiffPart[] = [];
  for (const r of raw) {
    const last = parts[parts.length - 1];
    if (last && last.type === r.type) last.text += r.ch;
    else parts.push({ type: r.type, text: r.ch });
  }
  return parts;
}

function parseSuggestions(text: string): Suggestion[] {
  const result: Suggestion[] = [];
  const blocks = text.split(/---SUGGESTION---/);
  for (const block of blocks.slice(1)) {
    const endIdx = block.indexOf('---END---');
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

    // 逐行解析，避免 regex 跨行誤匹配
    const fields: Record<string, string[]> = {};
    let cur = '';
    for (const line of content.split('\n')) {
      const km = line.match(/^(SECTION|ISSUE|OLD|NEW):\s*(.*)/);
      if (km) { cur = km[1]; fields[cur] = [km[2]]; }
      else if (cur && line.trim()) fields[cur].push(line);
    }
    // 把前後包著的引號／括號去掉，否則 AI 輸出 "違規詞" 這種帶引號的格式會跟文章原文比對不到
    const get = (k: string) => (fields[k] ?? []).join('\n').trim().replace(/^[「『【"“'']+/, '').replace(/[」』】"”'']+$/, '');

    const section = get('SECTION'), issue = get('ISSUE'), old = get('OLD');
    let nw = get('NEW');
    // 刪除標記正規化：AI 有時填「應刪除」、「（刪除）」等，統一轉成空字串
    if (/^[（(]?(?:刪除此句|刪除|移除|空)[）)]?$/.test(nw)) nw = '';

    if (old || nw) result.push({ id: Math.random().toString(36).slice(2), section, issue, old, new: nw, status: 'pending' });
  }
  return result.slice(0, 15);
}

function stripMd(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1');
}

function SuggestionCard({ s, onAccept, onReject, onJump }: {
  s: Suggestion; onAccept: () => void; onReject: () => void; onJump: () => void;
}) {
  const diff = (s.old || s.new) ? computeDiff(stripMd(s.old), stripMd(s.new)) : null;
  return (
    <div className={`border rounded-xl p-4 space-y-2.5 transition-opacity ${s.status !== 'pending' ? 'opacity-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {s.section && <span className="inline-block text-xs text-violet-500 font-medium mb-0.5">{s.section}</span>}
          <p className="text-sm text-gray-700">{s.issue}</p>
        </div>
        {s.status === 'pending' && s.old && (
          <button onClick={onJump} className="shrink-0 text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">跳至</button>
        )}
      </div>
      {diff && (
        <div className="text-sm rounded-lg bg-gray-50 px-3 py-2.5 leading-relaxed break-all font-sans border border-gray-100">
          {diff.map((p, i) =>
            p.type === 'del' ? <span key={i} className="bg-red-100 text-red-600 line-through">{p.text}</span>
            : p.type === 'add' ? <span key={i} className="bg-green-100 text-green-700">{p.text}</span>
            : <span key={i}>{p.text}</span>
          )}
        </div>
      )}
      {s.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={onAccept} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium">採用修改</button>
          <button onClick={onReject} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">略過</button>
        </div>
      )}
      {s.status === 'accepted' && <p className="text-xs text-emerald-600 font-medium">✓ 已採用</p>}
      {s.status === 'rejected' && <p className="text-xs text-gray-400">已略過</p>}
      {s.status === 'error' && <p className="text-xs text-red-500">找不到原文，請手動修改</p>}
    </div>
  );
}

function extractOverallEval(raw: string): string {
  const idx = raw.indexOf('---SUGGESTION---');
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

function buildFinalScorePrompt(article: string, opts: {
  title: string; keyword: string; initialEval: string;
}): string {
  return `文章標題：${opts.title}
目標關鍵字：${opts.keyword}

初稿審查結果（供比較參考）：
${opts.initialEval}

這篇文章已根據上述審查意見修改，請對修改後版本重新評分。評分必須反映改善程度：若問題已修正，分數應比初稿高；若改善有限，說明原因。

修改後文章：
${article}

只輸出整體評分與改善說明，格式：整體評分：X/10 — 說明（具體說明哪些問題已改善、哪些仍需注意）。繁體中文。`;
}

// ── Stage 4 ───────────────────────────────────────────────────────────

type ReviewMode = 'quality' | 'violation';

function Stage4({ title, keyword, sections, writingGuide, clientWritingRules, brandDescription, bannedWords, sectionOverride, onBack }: {
  title: string; keyword: string;
  sections: Section[];
  writingGuide: string; clientWritingRules: string;
  brandDescription: string; bannedWords: string; sectionOverride: string;
  onBack: () => void;
}) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>('quality');
  const [reviewing, setReviewing] = useState(false);
  const [overallEval, setOverallEval] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [finalScoring, setFinalScoring] = useState(false);
  const runIdRef = useRef(0);

  const initArticle = sections
    .filter(s => s.content.trim())
    .map(s => s.content.trim().replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, '![$1][圖片]'))
    .join('\n\n');
  const [articleText, setArticleText] = useState(initArticle);

  useEffect(() => { if (articleText.trim()) runReview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 切換內容校稿／違規詞校驗模式時，上一個模式留下的總評跟建議要清掉，
  // 否則畫面看起來毫無變化（只有 tab 跟按鈕文字換了），像是切換沒反應
  function switchReviewMode(mode: ReviewMode) {
    if (mode === reviewMode) return;
    setReviewMode(mode);
    setOverallEval(''); setSuggestions([]); setFinalScore(''); setError('');
  }

  async function runReview() {
    if (!articleText.trim()) return;
    const id = ++runIdRef.current;
    setOverallEval(''); setSuggestions([]); setFinalScore(''); setError(''); setReviewing(true);
    let buf = '';
    try {
      const sys = reviewMode === 'violation'
        ? buildViolationReviewSystemMessage({ clientWritingRules, brandDescription, bannedWords })
        : buildReviewSystemMessage({ writingGuide, clientWritingRules, sectionOverride, brandDescription });
      const prompt = reviewMode === 'violation'
        ? buildViolationReviewPrompt(articleText, { title, keyword })
        : buildReviewPrompt(articleText, { title, keyword });
      await streamAPI([
        { role: 'system', content: sys },
        { role: 'user', content: prompt },
      ], chunk => {
        if (runIdRef.current !== id) return;
        buf += chunk;
        setOverallEval(extractOverallEval(buf));
      });
      if (runIdRef.current === id) {
        setOverallEval(extractOverallEval(buf));
        setSuggestions(parseSuggestions(buf));
      }
    } catch (e) { if (runIdRef.current === id) setError(e instanceof Error ? e.message : '校稿失敗'); }
    finally { if (runIdRef.current === id) setReviewing(false); }
  }

  async function runFinalScore() {
    if (!articleText.trim()) return;
    const id = ++runIdRef.current;
    setFinalScore(''); setFinalScoring(true);
    let buf = '';
    try {
      const sys = reviewMode === 'violation'
        ? buildViolationReviewSystemMessage({ clientWritingRules, brandDescription, bannedWords })
        : buildReviewSystemMessage({ writingGuide, clientWritingRules, sectionOverride, brandDescription });
      const prompt = buildFinalScorePrompt(articleText, { title, keyword, initialEval: overallEval });
      await streamAPI([
        { role: 'system', content: sys },
        { role: 'user', content: prompt },
      ], chunk => {
        if (runIdRef.current !== id) return;
        buf += chunk;
        setFinalScore(buf);
      });
    } catch (e) { if (runIdRef.current === id) setFinalScore('評分失敗，請重試'); }
    finally { if (runIdRef.current === id) setFinalScoring(false); }
  }

  function applyChange(suggId: string) {
    const s = suggestions.find(x => x.id === suggId);
    if (!s) return;

    if (s.old) {
      // 1. 精確比對
      if (articleText.includes(s.old)) {
        setArticleText(prev => prev.replace(s.old, s.new));
        setSuggestions(prev => prev.map(x => x.id === suggId ? { ...x, status: 'accepted' } : x));
        return;
      }
      // 2. 空白彈性比對（允許換行 / 多空格差異）
      const escaped = s.old.trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
      try {
        const regex = new RegExp(escaped);
        if (regex.test(articleText)) {
          setArticleText(prev => prev.replace(regex, s.new));
          setSuggestions(prev => prev.map(x => x.id === suggId ? { ...x, status: 'accepted' } : x));
          return;
        }
      } catch { /* 正則無效，直接失敗 */ }
      // 3. 找不到
      setSuggestions(prev => prev.map(x => x.id === suggId ? { ...x, status: 'error' } : x));
      return;
    }

    // 無 OLD，直接附加 NEW
    setArticleText(prev => prev + (s.new ? '\n\n' + s.new : ''));
    setSuggestions(prev => prev.map(x => x.id === suggId ? { ...x, status: 'accepted' } : x));
  }

  function jumpToText(text: string, section?: string) {
    if (!text) return;
    const panel = document.getElementById('article-panel');
    if (!panel) return;
    const search = text.slice(0, 15);

    function searchFrom(startNode: Node | null): boolean {
      const walker = document.createTreeWalker(panel as Node, NodeFilter.SHOW_TEXT);
      if (startNode) walker.currentNode = startNode;
      let node = walker.nextNode();
      while (node) {
        const content = node.textContent ?? '';
        const idx = content.indexOf(search);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, Math.min(idx + text.length, content.length));
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
          (node.parentElement as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        node = walker.nextNode();
      }
      return false;
    }

    // 違規詞通常很短，整篇文章可能重複出現多次；若知道所在的 H2 段落，
    // 先定位到該標題之後才開始找，避免跳到不相關段落裡同樣的字詞
    const sectionName = section?.trim();
    if (sectionName) {
      const heading = Array.from(panel.querySelectorAll('h2'))
        .find(h => (h.textContent ?? '').trim() === sectionName);
      if (heading && searchFrom(heading)) return;
    }
    searchFrom(null);
  }

  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-400">{reviewMode === 'violation' ? '違規詞校驗 · 檢查禁詞與品牌宣稱範圍' : 'AI 校稿 · 先看總評，再逐條處理'}</p>
        </div>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 text-xs shrink-0">
          <button onClick={() => switchReviewMode('quality')} disabled={reviewing || finalScoring}
            className={`px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${reviewMode === 'quality' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            內容校稿
          </button>
          <button onClick={() => switchReviewMode('violation')} disabled={reviewing || finalScoring}
            className={`px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${reviewMode === 'violation' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
            違規詞校驗
          </button>
        </div>
        {suggestions.length > 0 && !reviewing && (
          <span className="text-xs text-violet-500 font-medium shrink-0">
            {pendingCount > 0 ? `${pendingCount} 條待確認` : '全部處理完畢 ✓'}
          </span>
        )}
        <button onClick={runReview} disabled={reviewing || finalScoring || !articleText.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">
          {reviewing && <Spinner />}{reviewing ? (reviewMode === 'violation' ? '檢查中…' : '校稿中…') : (reviewMode === 'violation' ? '開始檢查' : '重新校稿')}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full px-4 py-4 grid grid-cols-2 gap-4">
          {/* 左：可編輯原文 */}
          <div className="flex flex-col overflow-hidden">
            <p className="text-xs font-medium text-gray-500 mb-2 shrink-0">文章原文（可編輯）</p>
            <div id="article-panel" className="flex-1 overflow-auto">
              <RichEditor value={articleText} onChange={setArticleText} editable={true} minHeight="100%" />
            </div>
          </div>

          {/* 右：建議流程 / 最終結果 */}
          <div className="flex flex-col overflow-hidden gap-3">

            {(finalScore || finalScoring) ? (
              /* ── 最終評分獨立畫面 ── */
              <div className="flex-1 overflow-auto space-y-3 pr-0.5">
                {/* 初稿評分（縮小版） */}
                <div className="border border-gray-200 rounded-2xl px-4 py-3 bg-gray-50/50">
                  <p className="text-xs text-gray-400 mb-1">初稿評分</p>
                  <ReviewMd text={overallEval} />
                </div>
                {/* 修改後評分 */}
                {finalScoring ? (
                  <div className="border border-violet-200 rounded-2xl px-5 py-5 flex items-center gap-2.5 bg-violet-50/30">
                    <Spinner /><span className="text-sm text-gray-500">重新評分中…</span>
                  </div>
                ) : (
                  <div className="border border-emerald-200 rounded-2xl px-5 py-4 bg-emerald-50/30 space-y-1">
                    <p className="text-xs font-semibold text-emerald-600">修改後評分</p>
                    <ReviewMd text={finalScore} />
                    <p className="text-xs text-gray-400 pt-1">共採用 {acceptedCount} 條建議</p>
                  </div>
                )}
                <button
                  onClick={() => setFinalScore('')}
                  className="w-full py-2 text-xs border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                >
                  返回建議列表
                </button>
              </div>
            ) : (
              <>
                {/* ── 上：總評卡片 ── */}
                <div className="shrink-0">
                  {reviewMode === 'violation' && !bannedWords.trim() && !overallEval && !reviewing && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                      這個客戶尚未設定禁詞清單，仍會依寫文規範與品牌描述範圍檢查，但建議先到客戶設定補上禁詞。
                    </p>
                  )}
                  {reviewing && !overallEval && (
                    <div className="border border-violet-200 rounded-2xl bg-violet-50/30 px-5 py-4 flex items-center gap-2.5">
                      <Spinner /><span className="text-sm text-gray-500">AI 正在審查，生成總評…</span>
                    </div>
                  )}
                  {overallEval && (
                    <div className="border border-violet-200 rounded-2xl bg-violet-50/30 px-5 py-4 space-y-2 max-h-56 overflow-y-auto">
                      <ReviewMd text={overallEval} />
                      {!reviewing && !finalScoring && acceptedCount > 0 && (
                        <div className="border-t border-violet-100 pt-2">
                          <button onClick={runFinalScore}
                            className="w-full py-1.5 text-xs text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors font-medium">
                            完成修改，取得最終評分
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {error && <Err msg={error} />}
                </div>

                {/* ── 下：修改建議卡片 ── */}
                <div className="flex-1 overflow-auto space-y-2 pr-0.5">
                  {reviewing && overallEval && (
                    <div className="border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-gray-400">
                      <Spinner /><span>繼續解析修改建議…</span>
                    </div>
                  )}
                  {!reviewing && suggestions.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-gray-400 px-1">修改建議 · {suggestions.length} 條</p>
                      {suggestions.map(s => (
                        <SuggestionCard
                          key={s.id}
                          s={s}
                          onAccept={() => applyChange(s.id)}
                          onReject={() => setSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, status: 'rejected' } : x))}
                          onJump={() => jumpToText(s.old, s.section)}
                        />
                      ))}
                    </>
                  )}
                  {!reviewing && suggestions.length === 0 && overallEval && (
                    <p className="text-xs text-gray-400 text-center py-4">{reviewMode === 'violation' ? '未發現違規' : '無具體修改建議'}</p>
                  )}
                  {!reviewing && !overallEval && !error && (
                    <p className="text-sm text-gray-400 py-8 text-center">點擊「{reviewMode === 'violation' ? '開始檢查' : '重新校稿'}」開始</p>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Draft（localStorage 草稿暫存）────────────────────────────────────

const DRAFT_KEY = 'writer:compose:draft';

type Draft = {
  keyword: string;
  selectedTitle: string;
  analyzeMsg: string;
  analysisResult: string;
  outlineMsg: string;
  outlineResult: string;
  sections: Section[];
  clientWritingRules: string;
  brandDescription: string;
  bannedWords?: string;
  savedAt: number;
};

function saveDraft(d: Omit<Draft, 'savedAt'>) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* ignore */ }
}
function loadDraft(): Draft | null {
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) as Draft : null; } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
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
  const [bannedWords, setBannedWords] = useState('');
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});

  // Cross-stage context
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  const [analysisResult, setAnalysisResult] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [outlineMsg, setOutlineMsg] = useState('');
  const [outlineResult, setOutlineResult] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [reviewSections, setReviewSections] = useState<Section[]>([]);
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);

  function restoreDraft(d: Draft) {
    setAnalyzeMsg(d.analyzeMsg);
    setAnalysisResult(d.analysisResult);
    setSelectedTitle(d.selectedTitle);
    setClientWritingRules(d.clientWritingRules);
    setBrandDescriptionGlobal(d.brandDescription);
    setBannedWords(d.bannedWords ?? '');
    setOutlineMsg(d.outlineMsg);
    setOutlineResult(d.outlineResult);
    setSections(d.sections);
    setReviewSections([]);
    setStage('write');
    setSavedDraft(null);
  }

  useEffect(() => {
    setSavedDraft(loadDraft());
    fetch('/api/writer/prompt-override').then(r => r.json()).then((overrides: Record<string, string>) => {
      setPromptOverrides(overrides);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/writer/settings').then(r => r.json()).then((s: { writing_guide?: string }) => {
      setWritingGuide(s.writing_guide ?? '');
    }).catch(() => {});
  }, [stage]);

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

  const isFullScreen = stage === 'write' || stage === 'review';

  return (
    <div className={`flex flex-col ${isFullScreen ? 'h-screen' : 'min-h-screen'}`}>

      {/* Header */}
      <div className={`${isFullScreen ? 'hidden' : 'block'} border-b border-gray-100 bg-white`}>
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
      <div className={`flex-1 ${isFullScreen ? 'overflow-hidden' : 'px-6 py-8'}`}>
        {stage === 'analyze' && savedDraft && (
          <div className="max-w-2xl mx-auto mb-4">
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-800">找到上次的草稿</p>
                <p className="text-xs text-amber-600 truncate">{savedDraft.selectedTitle}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => restoreDraft(savedDraft)}
                  className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">
                  繼續撰寫 →
                </button>
                <button onClick={() => { setSavedDraft(null); clearDraft(); }}
                  className="text-xs text-amber-400 hover:text-amber-700 transition-colors">略過</button>
              </div>
            </div>
          </div>
        )}
        {stage === 'analyze' && (
          <Stage1
            keyword={keyword}
            vendor={vendor}
            writingGuide={writingGuide}
            analyzeOverride={promptOverrides.analyze ?? ''}
            onSaveAnalyzeOverride={text => savePromptOverride('analyze', text)}
            onDone={(msg, result, title, rules, brandDesc, banned) => {
              setAnalyzeMsg(msg);
              setAnalysisResult(result);
              setSelectedTitle(title);
              setClientWritingRules(rules);
              setBrandDescriptionGlobal(brandDesc);
              setBannedWords(banned);
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
              setReviewSections([]);
              saveDraft({ keyword, selectedTitle, analyzeMsg, analysisResult, outlineMsg: oMsg, outlineResult: oResult, sections: secs, clientWritingRules, brandDescription, bannedWords });
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
            bannedWords={bannedWords}
            sectionOverride={promptOverrides.section ?? ''}
            onSaveSectionOverride={text => savePromptOverride('section', text)}
            onBack={() => setStage('outline')}
            onNext={secs => { setReviewSections(secs); saveDraft({ keyword, selectedTitle, analyzeMsg, analysisResult, outlineMsg, outlineResult, sections: secs, clientWritingRules, brandDescription, bannedWords }); setStage('review'); }}
          />
        )}
        {stage === 'review' && (
          <Stage4
            title={selectedTitle}
            keyword={keyword}
            sections={reviewSections}
            writingGuide={writingGuide}
            clientWritingRules={clientWritingRules}
            brandDescription={brandDescription}
            bannedWords={bannedWords}
            sectionOverride={promptOverrides.section ?? ''}
            onBack={() => setStage('write')}
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
