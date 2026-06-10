import { NextRequest, NextResponse } from 'next/server';
import { listSubscriptions, createSubscription, SubscriptionStatus } from '@/lib/subscriptionDb';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as SubscriptionStatus | null;
  const rows = listSubscriptions(status ?? undefined);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, category, amount, currency, cycle, next_billing_date, status, note, payer, auto_renew, department } = body;

  if (!name || !category || amount == null) {
    return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  }

  const sub = createSubscription({ name, category, amount, currency, cycle, next_billing_date, status, note, payer, auto_renew, department });
  return NextResponse.json(sub, { status: 201 });
}
