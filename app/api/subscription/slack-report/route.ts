import { NextRequest, NextResponse } from 'next/server';
import { listSubscriptions } from '@/lib/subscriptionDb';

const EXCHANGE: Record<string, number> = { TWD: 1, USD: 32, JPY: 0.22 };

function toTWD(amount: number, currency: string) {
  return Math.round(amount * (EXCHANGE[currency] ?? 1));
}

function toMonthlyTWD(amount: number, currency: string, cycle: string): number {
  const twd = toTWD(amount, currency);
  if (cycle === 'yearly') return Math.round(twd / 12);
  if (cycle === 'onetime') return 0;
  return twd;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

const CYCLE_LABEL: Record<string, string> = { monthly: '月付', yearly: '年付', onetime: '一次性' };
const CATEGORY_LABEL: Record<string, string> = {
  ai: 'AI 工具', dev: '開發工具', design: '設計工具', storage: '雲端儲存', other: '其他雜支',
};

export async function POST(req: NextRequest) {
  // 驗證 CRON_SECRET 防止外部亂打
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }

  const webhookUrl = process.env.SLACK_SUBSCRIPTION_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: '未設定 SLACK_SUBSCRIPTION_WEBHOOK_URL' }, { status: 500 });
  }

  const active = listSubscriptions('active');

  const monthlyTWD = active.reduce((acc, s) => acc + toMonthlyTWD(s.amount, s.currency, s.cycle), 0);
  const yearlyTWD = monthlyTWD * 12;

  // 30天內到期
  const upcoming = active
    .filter(s => {
      const d = daysUntil(s.next_billing_date);
      return d !== null && d >= 0 && d <= 30;
    })
    .sort((a, b) => (a.next_billing_date ?? '').localeCompare(b.next_billing_date ?? ''));

  // 訂閱清單（只列 active，按類別排序）
  const sorted = [...active].sort((a, b) => a.category.localeCompare(b.category));

  // ── 組 Slack Block Kit 訊息 ──────────────────────────────────────────────

  const now = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric',
  });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '💳 訂閱費用雙週報告', emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `報告日期：${now}` }],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*本月預估費用*\nNT$ ${monthlyTWD.toLocaleString()}` },
        { type: 'mrkdwn', text: `*本年預估費用*\nNT$ ${yearlyTWD.toLocaleString()}` },
        { type: 'mrkdwn', text: `*有效訂閱數*\n${active.length} 項` },
        { type: 'mrkdwn', text: `*30天內續約*\n${upcoming.length} 項` },
      ],
    },
  ];

  // 即將到期
  if (upcoming.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*⚠️ 即將續約（30天內）*' },
    } as never);
    for (const s of upcoming) {
      const days = daysUntil(s.next_billing_date)!;
      const urgency = days <= 7 ? '🔴' : '🟡';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${urgency} *${s.name}*　${s.amount.toLocaleString()} ${s.currency}／${CYCLE_LABEL[s.cycle]}　→ *${days === 0 ? '今天' : `${days} 天後`}*（${s.next_billing_date}）`,
        },
      } as never);
    }
  }

  // 完整清單
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*📋 完整有效訂閱清單*' },
  } as never);

  const lines = sorted.map(s => {
    const days = daysUntil(s.next_billing_date);
    const renewLabel =
      s.cycle === 'onetime' ? '一次性'
      : days === null ? '未設定續費日'
      : days === 0 ? '今天續費'
      : days < 0 ? `已逾期 ${Math.abs(days)} 天`
      : `${days} 天後續費`;
    return `• ${CATEGORY_LABEL[s.category]}｜*${s.name}*　${s.amount.toLocaleString()} ${s.currency}　${renewLabel}　≈ NT$${toMonthlyTWD(s.amount, s.currency, s.cycle).toLocaleString()}/月`;
  });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n') || '（目前無有效訂閱）' },
  } as never);

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '參考匯率：1 USD ≈ 32 TWD・1 JPY ≈ 0.22 TWD' }],
  } as never);

  // ── 發送 ────────────────────────────────────────────────────────────────

  const slackRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!slackRes.ok) {
    const text = await slackRes.text();
    return NextResponse.json({ error: `Slack 回應錯誤：${text}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent: active.length, upcomingCount: upcoming.length });
}
