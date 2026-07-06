import { NextRequest, NextResponse } from 'next/server';
import { assignTask } from '@/lib/devDb';

const MEMBERS = ['nana', 'todd', 'steven', 'emma'];

// 把客戶進度追蹤的事件指派給成員（可多人，每人各建一筆任務）
export async function POST(req: NextRequest) {
  const { persons, title, content, due_date, source_key } = await req.json();
  if (!Array.isArray(persons) || persons.length === 0 || !title?.trim() || !source_key?.trim()) {
    return NextResponse.json({ error: '成員、標題與來源 key 為必填' }, { status: 400 });
  }
  const valid = persons.filter((p: string) => MEMBERS.includes(p));
  if (valid.length === 0) {
    return NextResponse.json({ error: '成員名單不合法' }, { status: 400 });
  }
  assignTask(valid, title.trim(), (content ?? '').trim(), (due_date ?? '').trim(), source_key.trim());
  return NextResponse.json({ ok: true });
}
