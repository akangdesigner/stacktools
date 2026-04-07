import { NextResponse } from 'next/server';

const SHEET_ID = '1sxk1hPnPRcNc8jf9eIMNrVByeQu9Jotic5b6BXshsLw';
const POSTS_GID = '287485541';

function parseCSV(text: string): Record<string, string>[] {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  return rows.slice(1)
    .filter(cols => cols.some(c => c.trim()))
    .map(cols => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? '').trim();
      });
      return row;
    })
    .filter(row => row['貼文擁有者']);
}

// 正確處理引號內含換行的 CSV
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        // 跳脫引號 ""
        cell += '"';
        i += 2;
      } else if (ch === '"') {
        // 結束引號
        inQuotes = false;
        i++;
      } else {
        // 引號內的任何字元（含換行）都屬於同一格
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
        i++;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 2;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }

  // 最後一格
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${POSTS_GID}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`抓取 Sheet 失敗：${res.status}`);

    const text = await res.text();
    const rows = parseCSV(text);

    const posts = rows.map(row => ({
      publishedAt:  row['發佈時間'] ?? '',
      owner:        row['貼文擁有者'] ?? '',
      type:         row['貼文形式'] ?? '',
      content:      row['文章內容'] ?? '',
      comment:      row['精選留言'] ?? '',
      likes:        Number(row['愛心數']) || 0,
      commentCount: Number(row['留言總數']) || 0,
      views:        Number(row['觀看數']) || 0,
      originalUrl:  row['原始貼文網址'] ?? '',
      plays:        Number(row['播放次數']) || 0,
      duration:     row['影片長度'] ?? '',
    }));

    return NextResponse.json({ posts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
