import { NextRequest, NextResponse } from 'next/server';
import {
  listClients, createClient, updateClient, deleteClient,
  listKeywords, replaceKeywords,
  listArticlePages, replaceArticlePages,
} from '@/lib/gscDb';

export async function GET() {
  const clients = listClients();
  const result = clients.map(c => ({
    ...c,
    keywords: listKeywords(c.id),
    article_pages: listArticlePages(c.id),
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
    auto_update?: boolean;
    article_sheet_id?: string;
    article_sheet_tab?: string;
    keywords?: { keyword: string; label: string }[];
    article_pages?: { type: string; title: string; url: string }[];
  };
  if (!body.id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  if (body.name !== undefined && body.site_url !== undefined) {
    updateClient(body.id, body.name.trim(), body.site_url.trim(), body.sheet_id ?? '', body.sheet_tab ?? '', body.auto_update ? 1 : 0, body.article_sheet_id ?? '', body.article_sheet_tab ?? '');
  }
  if (body.keywords !== undefined) {
    replaceKeywords(body.id, body.keywords);
  }
  if (body.article_pages !== undefined) {
    replaceArticlePages(body.id, body.article_pages);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  deleteClient(id);
  return NextResponse.json({ ok: true });
}
