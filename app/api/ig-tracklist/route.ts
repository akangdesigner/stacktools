import { NextResponse } from 'next/server';

const SHEET_ID = '1sxk1hPnPRcNc8jf9eIMNrVByeQu9Jotic5b6BXshsLw';
const TRACKLIST_GID = '0';

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TRACKLIST_GID}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`抓取失敗：${res.status}`);

    const text = await res.text();
    const lines = text.split('\n').filter(Boolean).slice(1); // 跳過標題列

    const accounts = lines
      .map(line => {
        const cols = line.split(',');
        const rawUrl = (cols[0] ?? '').trim().replace(/^"+|"+$/g, '');
        const name = (cols[1] ?? '').trim().replace(/^"+|"+$/g, '');
        return { url: rawUrl, name };
      })
      .filter(a => a.url.startsWith('http'));

    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
