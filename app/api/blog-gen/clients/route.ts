import { NextRequest, NextResponse } from 'next/server';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
} from '@/lib/blogGenDb';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const client = getClient(Number(id));
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
    return NextResponse.json(client);
  }
  return NextResponse.json(listClients());
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: '請填寫客戶名稱' }, { status: 400 });
  const client = createClient(name.trim());
  return NextResponse.json(client, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const { id, name, word_url, gdrive_url, persona, wp_url, wp_username, wp_app_password, wp_category_id } = await req.json();
  if (!id || !name?.trim()) return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
  updateClient(
    Number(id),
    name.trim(),
    word_url ?? '',
    gdrive_url ?? '',
    persona ?? '',
    (wp_url ?? '').replace(/\/+$/, ''),
    wp_username ?? '',
    wp_app_password ?? '',
    wp_category_id ?? '',
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteClient(Number(id));
  return NextResponse.json({ ok: true });
}
