#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// AI 小編 圖文選單（Rich Menu）一鍵註冊工具
//   建立「兩個分頁互切」的圖文選單：
//     ① 用戶設定/使用說明 分頁（圖 richmenu-settings.jpg）
//     ② 功能選單 分頁       （圖 richmenu-func.jpg）
//   上方長條左右兩半＝richmenuswitch 互切分頁；下方 2×2 四格＝開對應 LIFF。
//
//   ★ 為什麼要用 API：LINE 後台的圖文選單 UI「沒有切換分頁的動作」，
//     這種上方分頁條只能靠 Messaging API 的 richmenuswitch + alias 做，
//     所以在後台換背景圖會把分頁與 LIFF 動作弄亂，要用這支重建。
//
//   金鑰放 .env：AIEDITOR_LINE_TOKEN=<AI 小編 bot 的 channel access token>
//     （到 LINE Developers → 該 channel → Messaging API → Channel access token 取得）
//
//   圖片：預設讀桌面 line幫/richmenu-settings.jpg、richmenu-func.jpg
//         規格＝2500×1686、JPEG/PNG、< 1MB（用 sips 先轉好）
//
//   用法（專案根目錄執行）：
//     node scripts/aieditor-richmenu.cjs list     # 列出目前所有選單與 alias
//     node scripts/aieditor-richmenu.cjs create   # 建兩分頁＋上傳圖＋設互切＋設預設
//     node scripts/aieditor-richmenu.cjs clean     # 刪掉所有選單與 alias（重來用）
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.line.me/v2/bot';
const API_DATA = 'https://api-data.line.me/v2/bot';
const IMG_DIR = '/Users/kc/Desktop/line幫';

// 圖片尺寸（LINE 只收這個組合之一，這裡用最大的 2500×1686）
const SIZE = { width: 2500, height: 1686 };

// 分頁 alias（切換時互相指名）
const ALIAS_SETTINGS = 'aieditor-settings'; // 用戶設定/使用說明 分頁
const ALIAS_FUNC = 'aieditor-func';         // 功能選單 分頁
// 預設一進來看到哪個分頁：用戶設定（對齊原本線上預設；想改功能選單就換 ALIAS_FUNC）
const DEFAULT_ALIAS = ALIAS_SETTINGS;

// ── 點擊區座標（2500×1686）──
// 上方長條：全寬、高 0~350；左右各半（切換分頁用）
// 下方四格：350~1686 分成 2×2，左右在 x=1250 切、上下在 y=1015 切
// （數字對齊 2026-07-23 換的新版圖：分頁條較高、卡片列在 375~988 與 1040~1663）
const TOP = { y: 0, h: 350 };
const HALF_L = { x: 0, w: 1250 };
const HALF_R = { x: 1250, w: 1250 };
const ROW_T = { y: 350, h: 665 };
const ROW_B = { y: 1015, h: 671 };
const COL_L = { x: 0, w: 1250 };
const COL_R = { x: 1250, w: 1250 };

const uri = (id) => ({ type: 'uri', uri: `https://liff.line.me/${id}` });
const sw = (alias) => ({ type: 'richmenuswitch', richMenuAliasId: alias, data: `switch=${alias}` });
const box = (colOrHalf, row) => ({ x: colOrHalf.x, y: row.y, width: colOrHalf.w, height: row.h });

// ── 分頁一：用戶設定/使用說明（圖 richmenu-settings.jpg）──
const MENU_SETTINGS = {
  name: 'AI小編-用戶設定',
  chatBarText: '選單',
  image: 'richmenu-settings.jpg',
  alias: ALIAS_SETTINGS,
  areas: [
    // 上方分頁條：左半＝本頁(自己)、右半＝切到功能選單
    { bounds: box(HALF_L, TOP), action: sw(ALIAS_SETTINGS), label: '分頁條 用戶設定(本頁)' },
    { bounds: box(HALF_R, TOP), action: sw(ALIAS_FUNC), label: '分頁條 功能選單(切換)' },
    // 2×2：客戶資料管理 / 客戶文件導入 / 使用說明 / 短影音生成貼文
    { bounds: box(COL_L, ROW_T), action: uri('2010641165-NesFnKcz'), label: '客戶資料管理' },
    { bounds: box(COL_R, ROW_T), action: uri('2010641165-N0GnfY6M'), label: '客戶文件導入' },
    { bounds: box(COL_L, ROW_B), action: uri('2010641165-zQGEmQjz'), label: '使用說明' },
    { bounds: box(COL_R, ROW_B), action: uri('2010641165-RnvAONST'), label: '短影音生成貼文' },
  ],
};

// ── 分頁二：功能選單（圖 richmenu-func.jpg）──
const MENU_FUNC = {
  name: 'AI小編-功能選單',
  chatBarText: '選單',
  image: 'richmenu-func.jpg',
  alias: ALIAS_FUNC,
  areas: [
    // 上方分頁條：左半＝切到用戶設定、右半＝本頁(自己)
    { bounds: box(HALF_L, TOP), action: sw(ALIAS_SETTINGS), label: '分頁條 用戶設定(切換)' },
    { bounds: box(HALF_R, TOP), action: sw(ALIAS_FUNC), label: '分頁條 功能選單(本頁)' },
    // 2×2：節慶主題規劃 / 時事互動貼文 / 社群海巡留言 / 部落格文章改寫
    { bounds: box(COL_L, ROW_T), action: uri('2010641165-D2uKV61w'), label: '節慶主題規劃' },
    { bounds: box(COL_R, ROW_T), action: uri('2010641165-jfYbDXEe'), label: '時事互動貼文' },
    { bounds: box(COL_L, ROW_B), action: uri('2010641165-VIAOYoAs'), label: '社群海巡留言' },
    { bounds: box(COL_R, ROW_B), action: uri('2010641165-UnRe3wR1'), label: '部落格文章改寫' },
  ],
};

const MENUS = [MENU_SETTINGS, MENU_FUNC];

// ── 讀 .env 拿 AI 小編 bot 的 LINE token ──
function loadToken() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*AIEDITOR_LINE_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error('.env 找不到 AIEDITOR_LINE_TOKEN，請放進 AI 小編 bot 的 channel access token');
}

async function lineFetch(url, opts, token) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`LINE API ${res.status} @ ${url}：${JSON.stringify(data)}`);
  return data;
}

// 建一個選單物件 → 上傳圖 → 回傳 richMenuId
async function createOne(token, menu) {
  const abs = path.join(IMG_DIR, menu.image);
  if (!fs.existsSync(abs)) throw new Error(`找不到圖片：${abs}`);
  const buf = fs.readFileSync(abs);
  if (buf.length > 1024 * 1024) throw new Error(`${menu.image} ${(buf.length / 1048576).toFixed(2)}MB 超過 1MB，請先壓縮`);
  const contentType = abs.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  // ① 建立物件（areas 去掉自訂的 label 欄位，LINE 不吃）
  const body = {
    size: SIZE,
    selected: false,
    name: menu.name,
    chatBarText: menu.chatBarText,
    areas: menu.areas.map((a) => ({ bounds: a.bounds, action: a.action })),
  };
  const created = await lineFetch(`${API}/richmenu`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, token);
  const id = created.richMenuId;
  console.log(`\n① 已建立「${menu.name}」：${id}`);
  for (const a of menu.areas) {
    const act = a.action.type === 'uri' ? `開 ${a.action.uri}` : `切換→${a.action.richMenuAliasId}`;
    console.log(`   ・${a.label}  →  ${act}`);
  }

  // ② 上傳圖片
  await lineFetch(`${API_DATA}/richmenu/${id}/content`, {
    method: 'POST', headers: { 'Content-Type': contentType }, body: buf,
  }, token);
  console.log(`② 已上傳圖片（${(buf.length / 1024).toFixed(0)}KB）`);
  return id;
}

// 建/覆蓋 alias
async function setAlias(token, aliasId, richMenuId) {
  // 先試刪舊 alias（不存在會報錯，忽略）
  try { await lineFetch(`${API}/richmenu/alias/${aliasId}`, { method: 'DELETE' }, token); } catch { /* 沒有就算了 */ }
  await lineFetch(`${API}/richmenu/alias`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }),
  }, token);
  console.log(`   alias ${aliasId} → ${richMenuId}`);
}

async function cmdList(token) {
  const menus = (await lineFetch(`${API}/richmenu/list`, {}, token)).richmenus || [];
  console.log(menus.length ? `目前 ${menus.length} 個 rich menu：` : '目前沒有 rich menu');
  for (const m of menus) console.log(`  - ${m.richMenuId}  名稱=「${m.name}」`);
  const aliases = (await lineFetch(`${API}/richmenu/alias/list`, {}, token)).aliases || [];
  console.log(aliases.length ? `alias ${aliases.length} 個：` : '沒有 alias');
  for (const a of aliases) console.log(`  - ${a.richMenuAliasId} → ${a.richMenuId}`);
}

async function cmdClean(token) {
  const aliases = (await lineFetch(`${API}/richmenu/alias/list`, {}, token)).aliases || [];
  for (const a of aliases) { try { await lineFetch(`${API}/richmenu/alias/${a.richMenuAliasId}`, { method: 'DELETE' }, token); console.log(`刪 alias ${a.richMenuAliasId}`); } catch (e) { console.log(`刪 alias 失敗：${e.message}`); } }
  const menus = (await lineFetch(`${API}/richmenu/list`, {}, token)).richmenus || [];
  for (const m of menus) { try { await lineFetch(`${API}/richmenu/${m.richMenuId}`, { method: 'DELETE' }, token); console.log(`刪選單 ${m.richMenuId}`); } catch (e) { console.log(`刪選單 失敗：${e.message}`); } }
  console.log('清空完成');
}

async function cmdCreate(token) {
  // 先清舊的，避免殘留一堆
  await cmdClean(token);

  const ids = {};
  for (const menu of MENUS) ids[menu.alias] = await createOne(token, menu);

  // ③ 設 alias（分頁條的 richmenuswitch 靠它互切）
  console.log('\n③ 設定分頁 alias：');
  for (const menu of MENUS) await setAlias(token, menu.alias, ids[menu.alias]);

  // ④ 設預設分頁
  const defaultId = ids[DEFAULT_ALIAS];
  await lineFetch(`${API}/user/all/richmenu/${defaultId}`, { method: 'POST' }, token);
  console.log(`\n④ 已設預設分頁：${DEFAULT_ALIAS}（${defaultId}），所有使用者立即生效`);
  console.log('\n完成 ✅  重開一次聊天室即可看到新選單。');
}

async function main() {
  const cmd = process.argv[2];
  const token = loadToken();
  if (cmd === 'list') return cmdList(token);
  if (cmd === 'clean') return cmdClean(token);
  if (cmd === 'create') return cmdCreate(token);
  console.log('用法：\n  node scripts/aieditor-richmenu.cjs list\n  node scripts/aieditor-richmenu.cjs create\n  node scripts/aieditor-richmenu.cjs clean');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
