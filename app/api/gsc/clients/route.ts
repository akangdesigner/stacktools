import { NextRequest, NextResponse } from 'next/server';
import {
  listClients, createClient, updateClient, deleteClient,
  listKeywords, replaceKeywords,
} from '@/lib/gscDb';

export async function GET() {
  const clients = listClients();
  const result = clients.map(c => ({
    ...c,
    keywords: listKeywords(c.id),
  }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; site_url?: string };
  if (!body.name?.trim() || !body.site_url?.trim()) {
    return NextResponse.json({ error: '請填寫客戶名稱與站台網址' }, { status: 400 });
  }
  const client = createClient(body.name.trim(), body.site_url.trim());
  return NextResponse.json(client);
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as {
    id?: number;
    name?: string;
    site_url?: string;
    sheet_id?: string;
    sheet_tab?: string;
    keywords?: { keyword: string; label: string }[];
  };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  if (body.name !== undefined && body.site_url !== undefined) {
    updateClient(body.id, body.name.trim(), body.site_url.trim(), body.sheet_id ?? '', body.sheet_tab ?? '');
  }
  if (body.keywords !== undefined) {
    replaceKeywords(body.id, body.keywords);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteClient(id);
  return NextResponse.json({ ok: true });
}
