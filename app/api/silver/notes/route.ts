import { NextRequest, NextResponse } from 'next/server';
import { createUserNote, getUserNotes, getAllUserNotes } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, category, content } = await req.json();
  if (!userId || !category || !content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  const id = createUserNote(userId, category, content);
  return NextResponse.json({ id });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (userId) {
    return NextResponse.json({ notes: getUserNotes(userId) });
  }
  return NextResponse.json({ notes: getAllUserNotes() });
}
