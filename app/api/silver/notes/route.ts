import { NextRequest, NextResponse } from 'next/server';
import { createUserNote, getUserNotes, getAllUserNotes, deleteUserNote } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, category, content, importance } = await req.json();
  if (!userId || !category || !content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  const id = createUserNote(userId, category, content, importance === 'long_term' ? 'long_term' : 'short_term');
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    return NextResponse.json({ notes: getUserNotes(userId) });
  }
  return NextResponse.json({ notes: getAllUserNotes() });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  deleteUserNote(Number(id));
  return NextResponse.json({ ok: true });
}
