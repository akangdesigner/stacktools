import { NextResponse } from 'next/server';

const SHEET_ID = '1sxk1hPnPRcNc8jf9eIMNrVByeQu9Jotic5b6BXshsLw';
const TRACKLIST_GID = '0';

function parseCSVRow(line: string): string[] {
  const cols: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cols.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
  }
  cols.push(cell.trim());
  return cols;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TRACKLIST_GID}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`抓取失敗：${res.status}`);

    const text = await res.text();
    const lines = text.split('\n').filter(Boolean).slice(1); // 跳過標題列

    const accounts = lines
      .map(line => {
        const cols = parseCSVRow(line);
        const rawUrl  = cols[0] ?? '';
        const name    = cols[1] ?? '';
        const avatar  = cols[2] ?? '';
        return { url: rawUrl, name, avatar };
      })
      .filter(a => a.url.startsWith('http'));

    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
