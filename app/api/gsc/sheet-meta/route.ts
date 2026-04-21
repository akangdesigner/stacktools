import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';

export async function GET(req: NextRequest) {
  const sheetId = req.nextUrl.searchParams.get('sheetId');
  const gid = req.nextUrl.searchParams.get('gid');

  if (!sheetId) return NextResponse.json({ error: '缺少 sheetId' }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return NextResponse.json({ error: '尚未授權' }, { status: 401 });
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.json() as { error?: { message: string } };
    return NextResponse.json({ error: err.error?.message ?? '無法存取 Sheet' }, { status: 502 });
  }

  const data = await res.json() as { sheets: { properties: { sheetId: number; title: string } }[] };
  const sheets = data.sheets.map(s => ({ gid: s.properties.sheetId, title: s.properties.title }));

  if (gid) {
    const match = sheets.find(s => String(s.gid) === gid);
    return NextResponse.json({ sheets, tab: match?.title ?? null });
  }

  return NextResponse.json({ sheets });
}
