import { NextRequest, NextResponse } from 'next/server';
import { getSubscription, updateSubscription, deleteSubscription } from '@/lib/subscriptionDb';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getSubscription(id)) return NextResponse.json({ error: '找不到此訂閱' }, { status: 404 });

  const body = await req.json();
  updateSubscription(id, body);
  return NextResponse.json(getSubscription(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getSubscription(id)) return NextResponse.json({ error: '找不到此訂閱' }, { status: 404 });

  deleteSubscription(id);
  return NextResponse.json({ ok: true });
}
