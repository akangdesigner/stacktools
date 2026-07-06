import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTasks, getCompletedTasks, addTask, completeTask, deleteCurrentTask, deleteCompletedTask, updateCompletedTask, updateCurrentTask } from '@/lib/devDb';

export async function GET() {
  return NextResponse.json({
    current: getCurrentTasks(),
    completed: getCompletedTasks(),
  });
}

export async function POST(req: NextRequest) {
  const { person, title, content, note, start_date, due_date } = await req.json();
  if (!person?.trim() || !title?.trim()) {
    return NextResponse.json({ error: '人員與標題為必填' }, { status: 400 });
  }
  addTask(person.trim(), title.trim(), (content ?? '').trim(), (note ?? '').trim(), (start_date ?? '').trim(), (due_date ?? '').trim());
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id } = await req.json();
  const ok = completeTask(Number(id));
  return NextResponse.json({ ok });
}

export async function PUT(req: NextRequest) {
  const { id, type, title, content, note, completed_at, start_date, due_date } = await req.json();
  if (!id || !title?.trim()) return NextResponse.json({ error: '必填欄位缺失' }, { status: 400 });
  if (type === 'current') {
    // 更新進行中任務（含日程安排日期）
    updateCurrentTask(Number(id), title.trim(), (content ?? '').trim(), (note ?? '').trim(), (start_date ?? '').trim(), (due_date ?? '').trim());
  } else {
    updateCompletedTask(Number(id), title.trim(), (content ?? '').trim(), (note ?? '').trim(), completed_at);
  }
  return NextResponse.json({ ok: true });
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
