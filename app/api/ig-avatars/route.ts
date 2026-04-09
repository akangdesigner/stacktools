import { NextResponse } from 'next/server';

const SHEET_ID = '1sxk1hPnPRcNc8jf9eIMNrVByeQu9Jotic5b6BXshsLw';
const POSTS_GID = '287485541';

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { cell += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { row.push(cell); cell = ''; i++; }
      else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 2; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
      else { cell += ch; i++; }
    }
  }
  if (cell || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${POSTS_GID}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status}`);

    const rows = parseCSVRows(await res.text());
    if (rows.length < 2) return NextResponse.json({});

    const headers = rows[0].map(h => h.trim());
    const ownerIdx = headers.indexOf('貼文擁有者');
    const avatarIdx = headers.indexOf('頭像圖片位址');
    if (ownerIdx === -1 || avatarIdx === -1) return NextResponse.json({});

    const map: Record<string, string> = {};
    for (const row of rows.slice(1)) {
      const owner = (row[ownerIdx] ?? '').trim();
      const avatar = (row[avatarIdx] ?? '').trim();
      if (owner && avatar && !map[owner]) map[owner] = avatar;
    }

    return NextResponse.json(map);
  } catch (err) {
    return NextResponse.json({}, { status: 500 });
  }
}
