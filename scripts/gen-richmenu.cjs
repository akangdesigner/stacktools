#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// AI 小編圖文選單 生圖工具
//   用 OpenRouter 的 openai/gpt-5.4-image-2（中文正確）依序生兩張選單圖，
//   兩張共用同一段「風格描述」、只換頁籤 active 與四格內容，做到最大一致。
//   金鑰讀 .env 的 OPENROUTER_API_KEY，成品存到桌面 line幫/。
//
//   用法：node scripts/gen-richmenu.cjs
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = '/Users/kc/Desktop/line幫';
const MODEL = 'openai/gpt-5.4-image-2'; // 中文正確但慢（~200 秒/張）
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function loadKey() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*(OPENROUTER_IMAGE_API_KEY|OPENROUTER_API_KEY)\s*=\s*(.*)\s*$/);
    if (m) return m[2].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error('.env 找不到 OPENROUTER_API_KEY');
}

// ── 共用風格描述（兩張一字不差）──
const STYLE = `一張 LINE 圖文選單，2500×1686 橫向比例，精緻 3D 立體渲染風格（clay / glossy 3D render），淺冰藍漸層背景。品牌色：主色寶藍 #2B5CE6、點綴綠 #23AE6E、金黃。

【中央】直向排列：紅黃藍綠四顆 3D 積木堆疊，下面粗體英文「STACK AI」，再下面小字「AI × DATA × AUTOMATION」，兩個 × 都是藍色。

【四張功能卡】2×2 排列、夾住中央 logo。每張都是白色半透明玻璃卡、帶科技切角外框加雙層細描邊，卡內為 3D 圖示＋粗體繁體中文標題＋下方英文小字，且每張標題下方都有一條藍色短底線（四張完全一致）。

【裝飾】左下角一隻可愛藍白 3D 機器人、戴耳機、比 YA 手勢；右下角一支藍白 3D 火箭噴橘黃色火焰；右上角一顆藍色地球加土星環；背景散落小積木方塊、左上角點陣、六角形線框、虛線星座連線。整體乾淨俐落、有科技感、暖而有識別度。所有中文字必須清晰正確。`;

const PAGES = [
  {
    file: 'richmenu-page1.png',
    label: '第 1 頁（用戶設定 / 使用說明）',
    prompt: `${STYLE}

【頂部頁籤】一體連續的膠囊長條（中間有凹槽相連，不是分離兩塊）。左半深藍漸層底、白色人像 icon＋白字「用戶設定 / 使用說明」；右半白底、藍色四格方塊 icon＋藍字「功能選單」。本頁左半為 active（深藍那半）。

【四張功能卡內容】
・左上「客戶資料管理」CUSTOMER DATA：綠色人像識別證卡片＋藍色文件收納箱
・右上「客戶文件導入」DOCUMENT IMPORT：白色文件（藍色文字行）＋3D 機械手握著鉛筆書寫
・左下「使用說明」USER GUIDE：藍色精裝書＋白色齒輪＋綠色書籤
・右下「短影音生成貼文」SHORT VIDEO POST：智慧型手機＋紅色播放鍵＋場記板＋對話框`,
  },
  {
    file: 'richmenu-page2.png',
    label: '第 2 頁（功能選單）',
    prompt: `${STYLE}

【頂部頁籤】一體連續的膠囊長條（中間有凹槽相連，不是分離兩塊）。左半白底、藍色人像 icon＋藍字「用戶設定 / 使用說明」；右半深藍漸層底、白色四格方塊 icon＋白字「功能選單」。本頁右半為 active（深藍那半）。

【四張功能卡內容】
・左上「節慶主題規劃」THEME PLANNING：桌曆（其中一格打綠色勾）＋金色星星
・右上「時事互動貼文」SOCIAL ENGAGEMENT：藍色與綠色的對話框＋藍色勾勾
・左下「社群海巡留言」SOCIAL MONITORING：藍色圓角方塊底＋一群綠白色人像
・右下「部落格文章改寫」BLOG REWRITING：藍色文件＋綠色鉛筆`,
  },
];

async function genOne(key, page) {
  console.log(`\n▶ 開始生成 ${page.label}（模型較慢，約 3~4 分鐘，請耐心等）…`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 285_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tool.dg166.com',
        'X-Title': 'Stacktools RichMenu', // header 只能 Latin1
      },
      body: JSON.stringify({
        model: MODEL,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: [{ type: 'text', text: page.prompt }] }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(`OpenRouter ${res.status}：${raw.slice(0, 300)}`);
    }
    const data = await res.json();
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error('回傳沒有圖片（模型可能抽風，重跑一次）');
    const base64 = url.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const out = path.join(OUT_DIR, page.file);
    fs.writeFileSync(out, buf);
    console.log(`✅ 已存檔：${out}（${(buf.length / 1024).toFixed(0)} KB）`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const key = loadKey();
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  // 依序跑（不並行），避免互相干擾
  for (const page of PAGES) {
    try {
      await genOne(key, page);
    } catch (e) {
      console.error(`❌ ${page.label} 失敗：${e.message}`);
    }
  }
  console.log('\n完成。兩張都在：', OUT_DIR);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
