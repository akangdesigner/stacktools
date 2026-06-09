import { NextRequest, NextResponse } from 'next/server';
import { listUserClients, upsertUserClient, deleteUserClient } from '@/lib/writerDb';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

async function requireEmail() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return email;
}

export async function GET() {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(listUserClients(email));
}

export async function POST(req: NextRequest) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, brand_url, brand_description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const client = upsertUserClient(email, null, name.trim(), brand_url ?? '', brand_description ?? '');
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, name, brand_url, brand_description } = await req.json();
  if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name required' }, { status: 400 });
  const client = upsertUserClient(email, id, name.trim(), brand_url ?? '', brand_description ?? '');
  return NextResponse.json(client);
}

export async function DELETE(req: NextRequest) {
  const email = await requireEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteUserClient(email, id);
  return NextResponse.json({ ok: true });
}
