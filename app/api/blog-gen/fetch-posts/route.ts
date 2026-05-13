import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/blogGenDb';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('clientId');
  if (!id) return NextResponse.json({ error: '缺少 clientId' }, { status: 400 });

  const client = getClient(Number(id));
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  if (!client.wp_url) return NextResponse.json({ error: '尚未設定 WordPress 站台網址' }, { status: 400 });

  const base = client.wp_url.replace(/\/$/, '');
  const auth = Buffer.from(`${client.wp_username}:${client.wp_app_password}`).toString('base64');

  try {
    const res = await fetch(`${base}/wp-json/wp/v2/posts?per_page=100&status=publish&_fields=id,title,link`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `WordPress API 回應錯誤（${res.status}）：${text.slice(0, 200)}` }, { status: 502 });
    }

    const posts = await res.json() as { id: number; title: { rendered: string }; link: string }[];
    const result = posts.map(p => ({ id: p.id, title: p.title.rendered, link: p.link }));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
