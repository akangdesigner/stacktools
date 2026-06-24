import { NextRequest, NextResponse } from 'next/server';
import { upsertElementorClient, deleteElementorClient, type ElementorClientProfile } from '@/lib/elementorClientsDb';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await req.json() as ElementorClientProfile;
  if (profile.id !== id) return NextResponse.json({ error: 'id 不符' }, { status: 400 });
  upsertElementorClient(profile);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteElementorClient(id);
  return NextResponse.json({ ok: true });
}
