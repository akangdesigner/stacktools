#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Threads 主題草稿工具：讀／寫「thread主題草稿」分頁
//   走 App 自己的 GSC OAuth（data/gsc.db 的 refresh_token）換 access token，
//   直打 Sheets API（Drive MCP 帳號沒有這份私有表的權限，故用這條路）。
//
// 分頁欄位：A=主題（點子）  B=主文  C=留言
//
// 用法（都在專案根目錄執行）：
//   node scripts/thread-draft.cjs init            # 設好表頭 B1=主文 C1=留言
//   node scripts/thread-draft.cjs read            # 列出每列主題與主文/留言狀態
//   node scripts/thread-draft.cjs write out.json  # 批次寫回，out.json = [{row, main, comment}]
//                                                 #   row = 試算表實際列號（1-based）
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const SHEET_ID = '1VwGs_i7b-kk9HQtd0gBbkS8bFSO8cU7esKSGhEtJVzM';
const TAB = 'thread主題草稿';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

// 讀 .env 拿 Google OAuth 金鑰
function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

// 用 gsc.db 的 refresh_token 換 access token
async function getAccessToken() {
  const env = loadEnv();
  const db = new Database(path.join(ROOT, 'data', 'gsc.db'));
  const row = db.prepare("SELECT value FROM kv WHERE key = 'refresh_token'").get();
  if (!row) throw new Error('gsc.db 沒有 refresh_token，請先在 App 授權 Google 帳號');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: row.value,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('換 access token 失敗：' + JSON.stringify(data));
  return data.access_token;
}

async function api(at, url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  return data;
}

// 讀整個分頁 A:C
async function readRows(at) {
  const url = `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(TAB + '!A1:C1000')}`;
  const data = await api(at, url);
  return data.values || [];
}

async function cmdInit(at) {
  const url = `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(TAB + '!A1:C1')}?valueInputOption=RAW`;
  await api(at, url, { method: 'PUT', body: JSON.stringify({ values: [['主題', '主文', '留言']] }) });
  console.log('✅ 表頭已設為 A=主題 / B=主文 / C=留言');
}

async function cmdRead(at) {
  const rows = await readRows(at);
  console.log(`分頁「${TAB}」共 ${rows.length} 列：\n`);
  rows.forEach((r, i) => {
    if (i === 0) return; // 表頭
    const topic = (r[0] || '').trim();
    if (!topic) return;
    const hasMain = (r[1] || '').trim() ? '✅' : '⬜';
    const hasCmt = (r[2] || '').trim() ? '✅' : '⬜';
    console.log(`列${i + 1}  主文${hasMain} 留言${hasCmt}  ｜ ${topic.slice(0, 50)}`);
  });
}

// out.json = [{row: 2, main: "...", comment: "..."}]
async function cmdWrite(at, jsonPath) {
  const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const data = [];
  for (const it of items) {
    if (typeof it.row !== 'number') throw new Error('每筆需有 row（試算表列號）');
    if (it.topic != null) data.push({ range: `${TAB}!A${it.row}`, values: [[it.topic]] });
    if (it.main != null) data.push({ range: `${TAB}!B${it.row}`, values: [[it.main]] });
    if (it.comment != null) data.push({ range: `${TAB}!C${it.row}`, values: [[it.comment]] });
  }
  if (!data.length) { console.log('沒有可寫入的資料'); return; }
  const url = `${SHEETS}/${SHEET_ID}/values:batchUpdate`;
  await api(at, url, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  console.log(`✅ 已寫回 ${items.length} 列（${data.length} 個儲存格）`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const at = await getAccessToken();
  if (cmd === 'init') return cmdInit(at);
  if (cmd === 'read') return cmdRead(at);
  if (cmd === 'write') {
    if (!arg) throw new Error('用法：node scripts/thread-draft.cjs write out.json');
    return cmdWrite(at, arg);
  }
  console.log('用法：init | read | write <json檔>');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
