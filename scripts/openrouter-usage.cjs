#!/usr/bin/env node
// OpenRouter 用量查詢腳本
// 用法：node scripts/openrouter-usage.cjs
//
// 讀取 .env / .env.local 內的：
//   OPENROUTER_API_KEY            一般 key（可查總餘額 + 這隻 key 的日/週/月用量）
//   OPENROUTER_PROVISIONING_KEY   管理/供裝 key（可額外查過去 30 天「每模型、每天」明細）
//
// 到 OpenRouter 後台 → Settings → Provisioning Keys 開一支貼進 .env 即可看到分項。

const fs = require('fs');
const path = require('path');

// ── 讀 env（不覆蓋已存在的環境變數）──────────────────────────
function loadEnv(file) {
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {}
}
loadEnv('.env');
loadEnv('.env.local');

const KEY = process.env.OPENROUTER_API_KEY;
const PROV = process.env.OPENROUTER_PROVISIONING_KEY;

async function get(url, key) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const body = await res.text();
  try { return { ok: res.ok, json: JSON.parse(body) }; }
  catch { return { ok: res.ok, json: null, body }; }
}

function usd(n) { return '$' + Number(n).toFixed(4); }

(async () => {
  if (!KEY && !PROV) { console.error('找不到 OPENROUTER_API_KEY，請確認 .env'); process.exit(1); }

  // ① 總餘額 + 這隻 key 的用量
  if (KEY) {
    const credits = await get('https://openrouter.ai/api/v1/credits', KEY);
    const keyInfo = await get('https://openrouter.ai/api/v1/key', KEY);
    const c = credits.json?.data || {};
    const k = keyInfo.json?.data || {};
    console.log('══════════ 帳號總覽 ══════════');
    console.log(`總儲值：${usd(c.total_credits)}   已用：${usd(c.total_usage)}   剩餘：${usd((c.total_credits || 0) - (c.total_usage || 0))}`);
    console.log('\n══════════ 這隻 key 用量 ══════════');
    console.log(`今日：${usd(k.usage_daily)}   近7天：${usd(k.usage_weekly)}   近30天：${usd(k.usage_monthly)}   累計：${usd(k.usage)}`);
    const acctOther = (c.total_usage || 0) - (k.usage || 0);
    if (acctOther > 0.01) console.log(`（帳號其他 key 累計約 ${usd(acctOther)}，這隻 key 看不到，需 provisioning key）`);
  }

  // ② 每模型 / 每天明細（需 provisioning / management key）
  if (!PROV) {
    console.log('\n未設定 OPENROUTER_PROVISIONING_KEY → 略過每模型明細。');
    console.log('到後台 Settings → Provisioning Keys 開一支，加到 .env：OPENROUTER_PROVISIONING_KEY=sk-or-...');
    return;
  }

  console.log('\n══════════ 過去 30 天每模型明細 ══════════');
  const byModel = {};      // model -> {cost, requests, tokens}
  const byDay = {};        // date  -> cost
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const ds = d.toISOString().slice(0, 10);
    const r = await get(`https://openrouter.ai/api/v1/activity?date=${ds}`, PROV);
    if (!r.ok) { if (i === 1) console.log(`activity 查詢失敗：${r.body || JSON.stringify(r.json)}`); continue; }
    const rows = r.json?.data || [];
    for (const row of rows) {
      const m = row.model || row.model_permaslug || 'unknown';
      byModel[m] = byModel[m] || { cost: 0, requests: 0, tokens: 0 };
      byModel[m].cost += row.usage || 0;
      byModel[m].requests += row.requests || 0;
      byModel[m].tokens += (row.prompt_tokens || 0) + (row.completion_tokens || 0);
      byDay[ds] = (byDay[ds] || 0) + (row.usage || 0);
    }
  }

  const models = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  if (!models.length) { console.log('（30 天內無資料）'); return; }
  console.log('模型'.padEnd(34) + '花費'.padStart(12) + '次數'.padStart(9) + 'tokens'.padStart(13));
  for (const [m, v] of models) {
    console.log(m.slice(0, 33).padEnd(34) + usd(v.cost).padStart(12) + String(v.requests).padStart(9) + String(v.tokens).padStart(13));
  }
  const total = models.reduce((s, [, v]) => s + v.cost, 0);
  console.log(''.padEnd(34) + usd(total).padStart(12));

  console.log('\n══════════ 每日花費（近 30 天）══════════');
  for (const [d, c] of Object.entries(byDay).sort()) console.log(`${d}  ${usd(c)}`);
})();
