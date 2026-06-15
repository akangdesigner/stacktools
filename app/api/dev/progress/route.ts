import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTasks, getCompletedTasks, addTask, completeTask, deleteCurrentTask, deleteCompletedTask } from '@/lib/devDb';

export async function GET() {
  return NextResponse.json({
    current: getCurrentTasks(),
    completed: getCompletedTasks(),
  });
}

export async function POST(req: NextRequest) {
  const { person, title, content, note } = await req.json();
  if (!person?.trim() || !title?.trim()) {
    return NextResponse.json({ error: '人員與標題為必填' }, { status: 400 });
  }
  addTask(person.trim(), title.trim(), (content ?? '').trim(), (note ?? '').trim());
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id } = await req.json();
  const ok = completeTask(Number(id));
  return NextResponse.json({ ok });
}

export async function DELETE(req: NextRequest) {
  const { id, type } = await req.json();
  if (type === 'completed') {
    deleteCompletedTask(Number(id));
  } else {
    deleteCurrentTask(Number(id));
  }
  return NextResponse.json({ ok: true });
}
