import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (!token) return NextResponse.json({ error: '請提供 token' }, { status: 400 });

  try {
    const res = await fetch(
      `https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(token)}`
    );
    const data = await res.json() as {
      data?: Array<{ id: string; name: string }>;
      error?: { message: string };
    };
    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error?.message ?? '查詢失敗' }, { status: 400 });
    }
    const pages = (data.data ?? []).map(p => ({ id: p.id, name: p.name }));
    return NextResponse.json({ pages });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
