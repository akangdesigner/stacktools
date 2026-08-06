import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ActivityRow = { date: string; model: string; usage: number; requests: number };

const BIG_SPEND_THRESHOLD = 0.3; // 單次請求平均花費超過這個門檻才回報（目前最貴的 model 實測約 $0.23/次）

// management key 可查逐日/逐 model 明細；一般 key 打這支會 403，所以獨立成可選功能
async function fetchActivityBreakdown(managementKey: string) {
  const res = await fetch('https://openrouter.ai/api/v1/activity', {
    headers: { Authorization: `Bearer ${managementKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`activity 錯誤：${res.status}`);
  const json = await res.json();
  const rows: ActivityRow[] = json.data ?? [];

  const byDate = new Map<string, number>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + row.usage);
  }

  const daily = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([date, total]) => ({ date, total }));

  // activity 沒有單筆請求明細，只能用「這組(日期+model)平均每次請求花多少」抓異常
  const bigSpends = rows
    .filter((r) => r.requests > 0 && r.usage / r.requests > BIG_SPEND_THRESHOLD)
    .map((r) => ({ date: r.date.slice(0, 10), model: r.model, avgPerRequest: r.usage / r.requests, requests: r.requests }))
    .sort((a, b) => b.avgPerRequest - a.avgPerRequest)
    .slice(0, 5);

  return { daily, bigSpends };
}

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: '未設定 OPENROUTER_API_KEY' }, { status: 500 });
  }

  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [creditsRes, keyRes] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/credits', { headers, signal: AbortSignal.timeout(10000) }),
      fetch('https://openrouter.ai/api/v1/auth/key', { headers, signal: AbortSignal.timeout(10000) }),
    ]);

    if (!creditsRes.ok || !keyRes.ok) {
      throw new Error(`OpenRouter 回應錯誤：${creditsRes.status} / ${keyRes.status}`);
    }

    const credits = await creditsRes.json();
    const key = await keyRes.json();

    const totalCredits = credits.data?.total_credits ?? 0;
    const totalUsage = credits.data?.total_usage ?? 0;

    const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
    const breakdown = managementKey ? await fetchActivityBreakdown(managementKey).catch(() => null) : null;

    return NextResponse.json({
      totalCredits,
      totalUsage,
      remaining: totalCredits - totalUsage,
      usageDaily: key.data?.usage_daily ?? 0,
      usageWeekly: key.data?.usage_weekly ?? 0,
      usageMonthly: key.data?.usage_monthly ?? 0,
      daily: breakdown?.daily ?? null,
      bigSpends: breakdown?.bigSpends ?? null,
    });
  } catch (err) {
    console.error('讀取 OpenRouter 用量失敗', err);
    return NextResponse.json({ error: '讀取 OpenRouter 用量失敗' }, { status: 500 });
  }
}
