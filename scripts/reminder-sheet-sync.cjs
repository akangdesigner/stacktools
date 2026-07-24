#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// 就地更新「開案提醒｜提醒時間 & TAG 對照」試算表（不新增檔案）
//   走 App 的 GSC OAuth（data/gsc.db 的 refresh_token）換 access token 直打 Sheets API。
//   node scripts/reminder-sheet-sync.cjs check   # 只測讀取權限
//   node scripts/reminder-sheet-sync.cjs write   # 清空並寫入最新內容
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const SHEET_ID = '1PRVPQiWNiqnkVjLV-47G-VZYHc7SwJHY29mrNo1TLeE'; // 小積木指定要就地改的那份
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getAccessToken() {
  const env = loadEnv();
  const db = new Database(path.join(ROOT, 'data', 'gsc.db'));
  const row = db.prepare("SELECT value FROM kv WHERE key = 'refresh_token'").get();
  if (!row) throw new Error('gsc.db 沒有 refresh_token');
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

// 完整表格內容
function buildRows() {
  const seoMonthly = [
    ['第 6 月', '📊 滿六個月數據報表', 'Mike、Selina、Steven'],
    ['第 7 月', '📊 第七個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 8 月', '📊 第八個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 9 月', '📊 第九個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 10 月', '📊 第十個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 11 月', '📊 第十一個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 12 月', '📊 第十二個月數據報表 & 請款開發票', 'Mike、Selina、Steven、Jena'],
    ['第 13 月（到期）', '📑 客戶續約', 'Mike'],
  ];
  const rows = [];
  rows.push(['📝 open-case-alert · 開案提醒總覽', '', '', '', '', '（時區 Asia/Taipei · 2026-07-22）']);
  rows.push(['', '', '', '', '', '']);

  // 區塊 1：Slack 指令
  rows.push(['Slack 指令', '指令', '說明', '對應動作', '', '']);
  rows.push(['　建立', '/開案', '建立新案件（SEO 一般合約）', '建一般合約 → 產生第 6~13 月提醒', '', '']);
  rows.push(['　建立', '/開案月收', '建立月收案件', '建月收合約 → 產生第 1~13 月提醒', '', '']);
  rows.push(['　建立', '/網站收費', '建立網站收費提醒', '建網站收費 → 到期續約提醒', '', '']);
  rows.push(['　終止', '/終止合約seo', '刪除已開案 SEO 合約', '封存 SEO 合約與其提醒', '', '']);
  rows.push(['　終止', '/終止合約月付', '刪除已開案月付合約', '封存月收合約與其提醒', '', '']);
  rows.push(['　終止', '/終止合約網站', '刪除已開案網站合約', '封存網站收費', '', '']);
  rows.push(['', '', '', '', '', '']);

  // 區塊 2：提醒時間 & TAG
  rows.push(['分類', '排程時間', '觸發條件', '時機', '提醒內容', 'TAG 的人']);
  for (const [when, task, who] of seoMonthly) {
    rows.push(['SEO 一般合約 · 月度提醒', '每天 10:30', when.includes('13') ? '到期前一個月＋當天各一次' : '當天或明天到期', when, task, who]);
  }
  rows.push(['', '', '', '', '', '']);
  // 月收：1~6 月都「請款開發票 / Mike、Jena」，7~12 數據報表，13 續約
  const monthlyRows = [];
  for (let m = 1; m <= 6; m++) monthlyRows.push([`第 ${m} 月`, '📊 請款開發票', 'Mike、Jena']);
  const cnNum = { 7: '七', 8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二' };
  for (let m = 7; m <= 12; m++) monthlyRows.push([`第 ${m} 月`, `📊 第${cnNum[m]}個月數據報表 & 請款開發票`, 'Mike、Selina、Steven、Jena']);
  monthlyRows.push(['第 13 月（到期）', '📑 客戶續約', 'Mike']);
  for (const [when, task, who] of monthlyRows) {
    rows.push(['月收合約 · 月度提醒', '每天 10:30', when.includes('13') ? '到期前一個月＋當天各一次' : '當天或明天到期', when, task, who]);
  }
  rows.push(['', '', '', '', '', '']);
  rows.push(['網站收費 · 續約提醒', '每天 10:30', '到期當天 或 到期前一個月', '到期前一個月及當天', '💻 網站續約', 'Mike']);
  rows.push(['', '', '', '', '', '']);

  const progress = [
    [1, '啟動會議 + 訪談', 'Amy、Selina'], [7, '關鍵字建議書 + 關鍵字討論會議', 'Amy、Selina'],
    [14, '客戶核心關鍵字確認', 'Amy、Selina'], [21, '長尾關鍵字提供', 'Amy、Selina'],
    [28, '客戶長尾關鍵字確認', 'Amy、Selina'], [30, '第一次網站技術優化報告提供', 'Emma'],
    [35, '完成關鍵字分析', 'Amy、Selina'], [42, '完成至少 3 篇文章架構', 'Amy、Selina'],
    [49, '與客戶確認 3 篇文章架構', 'Amy、Selina'], [56, '完成 3 篇文章初稿', 'Amy、Selina'],
    [60, '第二次網站技術優化報告提供', 'Emma'], [63, '完成 3 篇文章定稿 + 上架', 'Amy、Selina'],
    [70, '完成部落格網站架設', 'Emma'],
  ];
  for (const [d, task, who] of progress) {
    rows.push(['專案進度（一般＋月收共用同一套）', '每天 10:30', '當天或明天', `第 ${d} 天`, task, who]);
  }
  rows.push(['', '', '', '', '', '']);

  // 區塊 3：人員對照
  rows.push(['Slack 人員 ID 對照', '', '', '姓名', 'Slack ID', '']);
  const roster = [['Mike', 'U07M343FY5Q'], ['Selina', 'U07M07TL9QD'], ['Steven', 'U07M3434L4S'],
    ['Jena', 'U07LWF0GVRC'], ['Amy', 'U08KZ5D8YBG'], ['Emma', 'U08UHLST3E3']];
  for (const [n, id] of roster) rows.push(['Slack 人員 ID 對照', '', '', n, id, '']);
  rows.push(['備註', '', '', '', '名單另有 偉多／william／patty／ilona／Claire 有登記 ID 但目前提醒都沒用到', '']);
  return rows;
}

async function main() {
  const cmd = process.argv[2] || 'check';
  const at = await getAccessToken();

  if (cmd === 'whoami') {
    const info = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${at}` } })).json();
    const ti = await (await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + at)).json();
    console.log('帳號 email：', info.email || ti.email || '(scope 未含 email，無法取得)');
    console.log('scope：', ti.scope || '(unknown)');
    return;
  }

  // 拿第一個分頁名稱
  const meta = await api(at, `${SHEETS}/${SHEET_ID}?fields=sheets.properties(sheetId,title)`);
  const tab = meta.sheets[0].properties.title;
  console.log(`✅ 可存取試算表，第一分頁＝「${tab}」`);

  if (cmd === 'customers') {
    const jsonPath = process.argv[3] || '/private/tmp/claude-501/-Users-kc-stacktools/e8cb45c9-297f-4cf0-ac17-a0be467d29a7/scratchpad/customers.json';
    const list = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const today = new Date();
    const planName = { '1_SEO一般': 'SEO 一般', '2_月收': '月收', '3_網站收費': '網站收費' };
    const monthsBetween = (a, b) => { a = new Date(a); b = new Date(b); let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--; return m; };
    const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

    const cnt = {}; for (const r of list) cnt[r.plan] = (cnt[r.plan] || 0) + 1;
    // 找「同一客戶同時有 SEO 與月收」＝疑似重複（收費方式互斥、會雙重提醒）
    const seoNames = new Set(list.filter(r => r.plan === '1_SEO一般').map(r => r.channel_name));
    const monthlyNames = new Set(list.filter(r => r.plan === '2_月收').map(r => r.channel_name));
    const dupSet = new Set([...seoNames].filter(n => monthlyNames.has(n)));

    let dueSoon = 0, expired = 0;
    const sorted = [...list].sort((a, b) => a.end_date.localeCompare(b.end_date));
    const detail = sorted.map(r => {
      const mon = monthsBetween(r.start_date, today) + 1;
      const dte = daysBetween(today, r.end_date);
      let status;
      if (dte < 0) { status = '❗ 已過期（待處理）'; expired++; }
      else if (dte <= 30) { status = '⚠️ 一個月內到期（該續約）'; dueSoon++; }
      else if (dte <= 60) { status = '🔶 兩個月內到期'; }
      else { status = '✅ 進行中'; }
      const dup = (dupSet.has(r.channel_name) && (r.plan === '1_SEO一般' || r.plan === '2_月收')) ? '⚠️ SEO＋月收 疑似重複' : '';
      return [planName[r.plan] || r.plan, r.channel_name, r.start_date, r.end_date, `第 ${mon} 個月`, `${dte} 天`, status, dup];
    });

    const rows = [];
    rows.push([`👥 客戶方案狀態（${today.toISOString().slice(0, 10)} 快照）`, '', '', '', '', '', '', '']);
    rows.push([`SEO 一般 ${cnt['1_SEO一般'] || 0} · 月收 ${cnt['2_月收'] || 0} · 網站收費 ${cnt['3_網站收費'] || 0}`, `合計 ${list.length} 筆合約`, `⚠️ 一個月內到期 ${dueSoon}`, `❗ 已過期 ${expired}`, `⚠️ SEO＋月收疑似重複 ${dupSet.size} 組`, '', '', '']);
    rows.push(['', '', '', '', '', '', '', '']);
    rows.push(['方案', '客戶', '開案日', '到期日', '進行到', '距到期', '狀態（依到期日排序）', '重複檢查']);
    for (const d of detail) rows.push(d);

    const title = '客戶方案狀態';
    if (!meta.sheets.find(s => s.properties.title === title)) {
      await api(at, `${SHEETS}/${SHEET_ID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
      console.log(`＋ 已新增分頁「${title}」`);
    }
    await api(at, `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(title + '!A:H')}:clear`, { method: 'POST', body: '{}' });
    await api(at, `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(title + '!A1')}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: rows }) });
    console.log(`✅ 已寫入「${title}」分頁：${detail.length} 筆客戶合約（即將到期 ${dueSoon}、已過期 ${expired}、SEO＋月收疑似重複 ${dupSet.size} 組）`);
    return;
  }

  if (cmd === 'rename') {
    const sheetId = meta.sheets[0].properties.sheetId;
    await api(at, `${SHEETS}/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId, title: '開案提醒' }, fields: 'title' } }] }),
    });
    console.log('✅ 分頁已改名為「開案提醒」');
    return;
  }

  if (cmd === 'check') {
    const cur = await api(at, `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(tab + '!A1:F3')}`);
    console.log('目前前幾列：', JSON.stringify(cur.values || [], null, 0).slice(0, 300));
    console.log('（check 模式：只讀不寫）');
    return;
  }

  if (cmd === 'write') {
    // 先清空 A:F 再寫，避免殘留舊列
    await api(at, `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(tab + '!A:F')}:clear`, { method: 'POST', body: '{}' });
    const values = buildRows();
    const url = `${SHEETS}/${SHEET_ID}/values/${encodeURIComponent(tab + '!A1')}?valueInputOption=RAW`;
    await api(at, url, { method: 'PUT', body: JSON.stringify({ values }) });
    console.log(`✅ 已就地寫入 ${values.length} 列到「${tab}」`);
  }
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
