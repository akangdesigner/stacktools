import { NextRequest, NextResponse } from 'next/server';
import { getGroups, getTodos, addTodo, toggleTodo, deleteTodo } from '@/lib/diaryDb';

export async function GET() {
  return NextResponse.json({ groups: getGroups(), todos: getTodos() });
}

export async function POST(req: NextRequest) {
  const { groupId, title } = await req.json();
  if (!groupId) return NextResponse.json({ error: '請指定區塊' }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: '內容必填' }, { status: 400 });
  addTodo(Number(groupId), title.trim());
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id, done } = await req.json();
  toggleTodo(Number(id), Boolean(done));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteTodo(Number(id));
  return NextResponse.json({ ok: true });
}
