import { NextRequest, NextResponse } from 'next/server';
import { getGroups, addGroup, renameGroup, deleteGroup } from '@/lib/diaryDb';

export async function GET() {
  return NextResponse.json({ groups: getGroups() });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '區塊名稱為必填' }, { status: 400 });
  }
  const id = addGroup(name.trim());
  return NextResponse.json({ ok: true, id });
}

export async function PUT(req: NextRequest) {
  const { id, name } = await req.json();
  if (!id || !name?.trim()) {
    return NextResponse.json({ error: '必填欄位缺失' }, { status: 400 });
  }
  renameGroup(Number(id), name.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  deleteGroup(Number(id));
  return NextResponse.json({ ok: true });
}
