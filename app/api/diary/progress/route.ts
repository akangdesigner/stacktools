import { NextRequest, NextResponse } from 'next/server';
import { getProgress, addProgress, updateProgress, deleteProgress, toggleProgressDone } from '@/lib/diaryDb';

export async function GET() {
  return NextResponse.json({ progress: getProgress() });
}

export async function POST(req: NextRequest) {
  const { tool, feature, status } = await req.json();
  if (!tool?.trim()) return NextResponse.json({ error: '工具名稱必填' }, { status: 400 });
  if (!feature?.trim()) return NextResponse.json({ error: '功能名稱必填' }, { status: 400 });
  addProgress(tool.trim(), feature.trim(), status || '開發中');
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const { id, tool, feature, status } = await req.json();
  if (!id || !tool?.trim()) return NextResponse.json({ error: '欄位缺失' }, { status: 400 });
  if (!feature?.trim()) return NextResponse.json({ error: '功能名稱必填' }, { status: 400 });
  updateProgress(Number(id), tool.trim(), feature.trim(), status || '開發中');
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id, done } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  toggleProgressDone(Number(id), Boolean(done));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteProgress(Number(id));
  return NextResponse.json({ ok: true });
}
