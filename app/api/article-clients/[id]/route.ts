import { NextRequest, NextResponse } from 'next/server';
import { upsertArticleClient, deleteArticleClient } from '@/lib/articleClientsDb';
import type { ClientProfile } from '@/types';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await req.json() as ClientProfile;
  if (profile.id !== id) return NextResponse.json({ error: 'id 不符' }, { status: 400 });
  upsertArticleClient(profile);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteArticleClient(id);
  return NextResponse.json({ ok: true });
}
