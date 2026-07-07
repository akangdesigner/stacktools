// Markdown → Elementor 資料結構轉換
// -----------------------------------------------------------------------------
// 用途：把 /writer 寫手流程產出的 Markdown 全文，轉成 Elementor 能吃的 JSON
//      （寫進 WordPress 的 _elementor_data 欄位）。
//
// 拆段策略（小積木要的「每個 H2 拆成獨立元件」）：
//   - 每個 ## H2 段落 → 一個 Elementor section（可整段拖拉搬移）
//   - section 內：H2 做成 heading 元件；H2 底下的內文與每個 ### H3 再細分：
//       · H2 標題後、第一個 H3 前的開場文字 → 一個 text-editor 元件
//       · 每個 ### H3 → 一個 heading 元件（h3）＋ 一個 text-editor 元件（該 H3 內文）
//   - 這樣拖拉粒度細到每個 H3，內文（段落／清單／表格）用 HTML 塞進 text-editor
// -----------------------------------------------------------------------------

import { marked } from 'marked';
import { randomBytes } from 'crypto';

// marked 全域設定：開 GFM（支援表格、刪除線等），關掉自動換行成 <br>（維持段落語意）
marked.setOptions({ gfm: true, breaks: false });

// 產生 Elementor 元件的隨機 id（Elementor 慣例是 7 位英數，只要頁面內唯一即可）
function eid(): string {
  return randomBytes(4).toString('hex').slice(0, 7);
}

// Markdown 片段 → HTML 字串（給 text-editor 元件用）
function mdToHtml(md: string): string {
  const text = md.trim();
  if (!text) return '';
  return (marked.parse(text, { async: false }) as string).trim();
}

// 型別：Elementor 樹狀節點
type ElNode = {
  id: string;
  elType: 'section' | 'column' | 'widget';
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElNode[];
  isInner?: boolean;
};

// 建一個 heading 元件（標題文字＋層級 h2/h3）
function headingWidget(title: string, size: 'h2' | 'h3'): ElNode {
  return {
    id: eid(),
    elType: 'widget',
    widgetType: 'heading',
    settings: { title: title.trim(), header_size: size },
    elements: [],
  };
}

// 建一個 text-editor 元件（內容為 HTML）
function textWidget(html: string): ElNode {
  return {
    id: eid(),
    elType: 'widget',
    widgetType: 'text-editor',
    settings: { editor: html },
    elements: [],
  };
}

// 建一個 image 元件（獨立圖片，Elementor 原生圖片元件而非塞在文字裡的 <img>）
// mediaId 有值代表圖片已上傳到媒體庫，能跟媒體庫連動；沒有就只用網址顯示
function imageWidget(url: string, alt: string, mediaId?: number): ElNode {
  return {
    id: eid(),
    elType: 'widget',
    widgetType: 'image',
    settings: {
      image: { url, id: mediaId ?? '', alt: alt || '', source: 'library' },
    },
    elements: [],
  };
}

// 把一段內文（多行）轉成 widget 陣列：
//   · 整行就是一張圖片（![alt](url)）→ 抽成獨立 image 元件
//   · 其餘連續文字行 → 合併成一個 text-editor 元件
// mediaMap 是「圖片網址 → 媒體庫 ID」對照，發布端上傳圖片後帶進來
function bodyToWidgets(lines: string[], mediaMap: Record<string, number>): ElNode[] {
  const widgets: ElNode[] = [];
  let buf: string[] = [];
  const flush = () => {
    const html = mdToHtml(buf.join('\n'));
    if (html) widgets.push(textWidget(html));
    buf = [];
  };
  for (const line of lines) {
    // 只認「整行就是一張圖」的情況（Stage3 產出的圖片都是獨立段落）；
    // 夾在文字中間的 inline 圖片維持走 text-editor，不強拆
    const m = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (m) {
      flush();
      const url = m[2];
      widgets.push(imageWidget(url, m[1], mediaMap[url]));
    } else {
      buf.push(line);
    }
  }
  flush();
  return widgets;
}

// 把一組 widget 包成 section > column(100%) > widgets
function sectionWrap(widgets: ElNode[]): ElNode {
  const column: ElNode = {
    id: eid(),
    elType: 'column',
    settings: { _column_size: 100, _inline_size: null },
    elements: widgets,
  };
  return {
    id: eid(),
    elType: 'section',
    settings: {},
    elements: [column],
  };
}

// 解析後的段落中繼結構
type ParsedSection = {
  h2: string;
  intro: string[];              // H2 標題後、第一個 H3 前的內文行
  subs: { h3: string; body: string[] }[];
};

// 把 Markdown 全文切成 H2 段落（每段再依 H3 細分）
function parseMarkdown(md: string): ParsedSection[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const sections: ParsedSection[] = [];
  let cur: ParsedSection | null = null;
  let curSub: { h3: string; body: string[] } | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);

    if (h2) {
      // 遇到新的 H2：收掉前一段，開新段
      cur = { h2: h2[1].trim(), intro: [], subs: [] };
      curSub = null;
      sections.push(cur);
    } else if (h3) {
      // 遇到 H3：若還沒有任何 H2（理論上不會），先補一個空 H2 容器
      if (!cur) {
        cur = { h2: '', intro: [], subs: [] };
        sections.push(cur);
      }
      curSub = { h3: h3[1].trim(), body: [] };
      cur.subs.push(curSub);
    } else {
      // 一般內文行：歸到目前的 H3，或段落開場（intro）
      if (!cur) {
        // 文章開頭若有 H2 之前的散文，自成一段（無標題）
        cur = { h2: '', intro: [], subs: [] };
        sections.push(cur);
      }
      if (curSub) curSub.body.push(line);
      else cur.intro.push(line);
    }
  }
  return sections;
}

// 主函式：Markdown 全文 → Elementor _elementor_data（section 陣列）
// mediaMap：發布端把 base64 圖片上傳媒體庫後，傳入「圖片網址 → 媒體庫 ID」對照
export function markdownToElementor(markdown: string, mediaMap: Record<string, number> = {}): ElNode[] {
  const parsed = parseMarkdown(markdown);
  const out: ElNode[] = [];

  for (const sec of parsed) {
    const widgets: ElNode[] = [];

    // H2 標題（若有）
    if (sec.h2) widgets.push(headingWidget(sec.h2, 'h2'));

    // H2 開場內文（圖片會被抽成獨立 image 元件）
    widgets.push(...bodyToWidgets(sec.intro, mediaMap));

    // 各 H3 子節：標題 + 內文
    for (const sub of sec.subs) {
      widgets.push(headingWidget(sub.h3, 'h3'));
      widgets.push(...bodyToWidgets(sub.body, mediaMap));
    }

    // 整段沒有任何內容就跳過（避免產生空 section）
    if (widgets.length === 0) continue;

    out.push(sectionWrap(widgets));
  }

  return out;
}
