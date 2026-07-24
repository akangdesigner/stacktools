#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 銀髮機器人 圖文選單（Rich Menu）註冊工具
//   用 LINE Messaging API 建立「2×3 六格」主選單，每格點下去先「送文字」，
//   文字內容對齊主流程「銀髮機器人」的『分流』Switch 關鍵字，行為才會正確。
//   之後要把 1/5/6 改成開 LIFF 網頁時，只要改 AREAS 裡對應那格的 action 即可。
//
//   選單圖片外觀（PNG）由小積木自己在後台設計好、匯出，這支只負責：
//     ① 建立 rich menu 物件（尺寸 + 六格點擊區 + 動作）
//     ② 上傳選單圖片
//     ③ 設為所有使用者的預設選單
//
//   金鑰放 .env：SILVER_LINE_TOKEN=<銀髮 bot 的 channel access token>
//
//   用法（都在專案根目錄執行）：
//     node scripts/silver-richmenu.cjs list                 # 列出目前所有 rich menu
//     node scripts/silver-richmenu.cjs create menu.png      # 建立+上傳圖+設為預設
//     node scripts/silver-richmenu.cjs create menu.png --clean-old
//                                                           #   同上，並刪掉其他舊選單
//     node scripts/silver-richmenu.cjs delete <richMenuId>  # 刪指定選單
//
//   圖片規格：JPEG 或 PNG、建議 2500×1686、檔案 < 1MB。
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.line.me/v2/bot';
const API_DATA = 'https://api-data.line.me/v2/bot';

// ── 讀 .env 拿銀髮 bot 的 LINE token ──
function loadToken() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*SILVER_LINE_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  throw new Error('.env 找不到 SILVER_LINE_TOKEN，請先把銀髮 bot 的 channel access token 放進 .env');
}

// ── 選單定義：2×3 六格（寬 2500 / 高 1686），每格送對應文字 ──
//   欄寬：833 / 834 / 833（加總=2500）；列高：843 / 843（加總=1686）
//   action.text 必須對齊『分流』Switch 的關鍵字，長輩點了才會進正確功能。
const COL = [
  { x: 0, w: 833 },     // 左欄
  { x: 833, w: 834 },   // 中欄
  { x: 1667, w: 833 },  // 右欄
];
const ROW = [
  { y: 0, h: 843 },     // 上列
  { y: 843, h: 843 },   // 下列
];
// 祝福圖 LIFF（銀髮 bot 專屬，頁面在 ai-linebot：linebot.fundaypet.com/silver/bless；需登入取 uid）
const BLESS_LIFF_URL = 'https://liff.line.me/2010714414-EgPgzObL';
// 新聞頁（ai-linebot，純瀏覽不需登入 → 直接開網址，在 LINE 內建瀏覽器開）
const NEWS_URL = 'https://linebot.fundaypet.com/silver/news';
// 旅遊頁（ai-linebot，純瀏覽不需登入）
const TRAVEL_URL = 'https://linebot.fundaypet.com/silver/travel';

const CELLS = [
  // 上列：1 祝福圖(開 LIFF) / 2 照片修復 / 3 食譜卡
  { col: 0, row: 0, uri: BLESS_LIFF_URL, label: '1 AI長輩祝福圖（開 LIFF）' },
  { col: 1, row: 0, text: '懷舊照片修復', label: '2 懷舊照片修復（功能準備中）' },
  { col: 2, row: 0, text: '家傳食譜卡', label: '3 家傳食譜卡（功能準備中）' },
  // 下列：4 健康提醒 / 5 旅遊 / 6 新聞(開網頁)
  { col: 0, row: 1, text: '健康提醒', label: '4 銀髮健康提醒' },
  { col: 1, row: 1, uri: TRAVEL_URL, label: '5 旅遊景點推薦（開網頁）' },
  { col: 2, row: 1, uri: NEWS_URL, label: '6 時事新聞圖卡（開網頁）' },
];

function buildMenu() {
  const areas = CELLS.map((c) => ({
    bounds: { x: COL[c.col].x, y: ROW[c.row].y, width: COL[c.col].w, height: ROW[c.row].h },
    // 有 uri 的格子開網頁（LIFF），其餘送文字
    action: c.uri ? { type: 'uri', uri: c.uri } : { type: 'message', text: c.text },
  }));
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: '銀髮機器人主選單',
    chatBarText: '功能選單',
    areas,
  };
}

async function lineFetch(url, opts, token) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`LINE API ${res.status}：${JSON.stringify(data)}`);
  }
  return data;
}

// ── list：列出目前所有 rich menu ──
async function cmdList(token) {
  const data = await lineFetch(`${API}/richmenu/list`, {}, token);
  const menus = data.richmenus || [];
  if (!menus.length) { console.log('目前沒有任何 rich menu'); return menus; }
  console.log(`目前有 ${menus.length} 個 rich menu：`);
  for (const m of menus) {
    console.log(`  - ${m.richMenuId}  名稱=「${m.name}」  chatBar=「${m.chatBarText}」`);
  }
  return menus;
}

// ── delete：刪指定選單 ──
async function cmdDelete(token, id) {
  if (!id) throw new Error('請帶要刪除的 richMenuId');
  await lineFetch(`${API}/richmenu/${id}`, { method: 'DELETE' }, token);
  console.log(`已刪除 ${id}`);
}

// ── create：建立物件 → 上傳圖 → 設為預設（可選 --clean-old 清舊）──
async function cmdCreate(token, imgPath, cleanOld) {
  if (!imgPath) throw new Error('請帶選單圖片路徑，例如：node scripts/silver-richmenu.cjs create menu.png');
  const abs = path.resolve(process.cwd(), imgPath);
  if (!fs.existsSync(abs)) throw new Error(`找不到圖片：${abs}`);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : null;
  if (!contentType) throw new Error('圖片只接受 .png / .jpg / .jpeg');
  if (buf.length > 1024 * 1024) throw new Error(`圖片 ${(buf.length / 1024 / 1024).toFixed(2)}MB 超過 1MB 上限，請壓縮`);

  // 建立前先記下舊選單（供 --clean-old 用）
  const before = await lineFetch(`${API}/richmenu/list`, {}, token);
  const oldIds = (before.richmenus || []).map((m) => m.richMenuId);

  // ① 建立 rich menu 物件
  const menu = buildMenu();
  console.log('六格動作：');
  for (const c of CELLS) console.log(`  ${c.label}  →  ${c.uri ? `開網頁 ${c.uri}` : `送出「${c.text}」`}`);
  const created = await lineFetch(`${API}/richmenu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(menu),
  }, token);
  const richMenuId = created.richMenuId;
  console.log(`\n① 已建立 rich menu：${richMenuId}`);

  // ② 上傳選單圖片
  await lineFetch(`${API_DATA}/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: buf,
  }, token);
  console.log(`② 已上傳圖片（${contentType}，${(buf.length / 1024).toFixed(0)}KB）`);

  // ③ 設為所有使用者的預設選單
  await lineFetch(`${API}/user/all/richmenu/${richMenuId}`, { method: 'POST' }, token);
  console.log('③ 已設為預設選單，所有使用者立即生效');

  // 可選：清掉舊選單
  if (cleanOld && oldIds.length) {
    for (const id of oldIds) {
      try { await cmdDelete(token, id); } catch (e) { console.log(`  刪 ${id} 失敗：${e.message}`); }
    }
  } else if (oldIds.length) {
    console.log(`\n（提醒）還有 ${oldIds.length} 個舊選單留著，要清就加 --clean-old：`);
    for (const id of oldIds) console.log(`  ${id}`);
  }

  console.log('\n完成 ✅');
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const cleanOld = process.argv.includes('--clean-old');
  const token = loadToken();
  if (cmd === 'list') return cmdList(token);
  if (cmd === 'delete') return cmdDelete(token, arg);
  if (cmd === 'create') return cmdCreate(token, arg, cleanOld);
  console.log('用法：\n  node scripts/silver-richmenu.cjs list\n  node scripts/silver-richmenu.cjs create menu.png [--clean-old]\n  node scripts/silver-richmenu.cjs delete <richMenuId>');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
