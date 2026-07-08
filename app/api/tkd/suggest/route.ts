import { NextRequest, NextResponse } from 'next/server';
import { collectUrls, fetchAllTkd } from '@/lib/tkd-crawler';
import { detectPlatform, extract91appH1 } from '@/lib/tkd-platform';
import {
  extractSheetId,
  extractGid,
  resolveTabName,
  readValues,
  batchUpdateValues,
  colLetter,
} from '@/lib/tkd-sheet';
import { generateSuggestion } from '@/lib/tkd-suggest';

// 逐頁呼叫 AI 較久，放寬執行時間上限
export const maxDuration = 300;
const MAX_LIMIT = 300;

const norm = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

// 網址正規化（decode、去尾斜線、小寫）供兩邊比對
function keyUrl(u: string): string {
  try {
    return decodeURI(u).replace(/\/+$/, '').toLowerCase();
  } catch {
    return u.replace(/\/+$/, '').toLowerCase();
  }
}

// 從 HYPERLINK 公式或純網址字串取出網址
function cellUrl(cell: string): string {
  const s = String(cell || '');
  const m = s.match(/HYPERLINK\("([^"]+)"/i);
  return m ? m[1] : s;
}

// A1 notation 的分頁名要用單引號包（名稱含單引號則以兩個單引號跳脫）
const tabRef = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteUrl?: string;
      sheetUrl?: string;
      limit?: number;
      scope?: 'important' | 'all';
    };
    const siteUrl = body.siteUrl?.trim();
    const sheetUrl = body.sheetUrl?.trim();
    if (!siteUrl) return NextResponse.json({ error: '請輸入客戶網址' }, { status: 400 });
    if (!sheetUrl) return NextResponse.json({ error: '請輸入登記表網址' }, { status: 400 });

    const limit = Math.min(body.limit && body.limit > 0 ? body.limit : 100, MAX_LIMIT);
    const scope = body.scope === 'all' ? 'all' : 'important';

    // 重爬每頁：取得正文 content 與現有 TKD（建議生成要靠正文）
    // 91APP 的 h1 由 JS 渲染 server 讀不到，偵測到就注入 extract91appH1 還原，讓 AI 生建議時看得到現有 h1
    const platform = await detectPlatform(siteUrl);
    const pages = await fetchAllTkd(
      await collectUrls(siteUrl, limit, scope),
      6,
      platform === '91app' ? extract91appH1 : undefined,
    );
    if (pages.length === 0) {
      return NextResponse.json({ error: '找不到任何頁面，請確認網址' }, { status: 400 });
    }

    const sheetId = extractSheetId(sheetUrl);
    const gid = extractGid(sheetUrl);
    const tabName = await resolveTabName(sheetId, gid);
    const { headers, rows, rowOffset } = await readValues(sheetId, tabName);

    const idxPage = headers.findIndex((h) => {
      const n = norm(h);
      return n.includes('頁面') || n.includes('網址') || n.includes('url');
    });
    const idxT = headers.findIndex((h) => norm(h).includes('建議') && norm(h).includes('title'));
    const idxD = headers.findIndex((h) => norm(h).includes('建議') && norm(h).includes('description'));
    const idxK = headers.findIndex((h) => norm(h).includes('建議') && norm(h).includes('keywords'));
    const idxH = headers.findIndex((h) => norm(h).includes('建議') && norm(h).includes('h1'));
    if (idxPage < 0) return NextResponse.json({ error: '登記表找不到「頁面」欄' }, { status: 400 });
    if (idxT < 0 && idxD < 0 && idxK < 0 && idxH < 0) {
      return NextResponse.json({ error: '登記表找不到任何「建議」欄' }, { status: 400 });
    }

    // 建立 網址 → sheet 列號 的對照
    const rowOf = new Map<string, number>();
    rows.forEach((r, i) => {
      const u = keyUrl(cellUrl(r[idxPage]));
      if (u) rowOf.set(u, rowOffset + i);
    });

    const data: { range: string; values: string[][] }[] = [];
    const results: { url: string; label?: string; error?: string; ok?: boolean }[] = [];

    // 逐頁「依序」呼叫 AI（不可並行，並行會被截短）
    for (const p of pages) {
      const sheetRow = rowOf.get(keyUrl(p.url));
      if (!sheetRow) continue; // 這頁不在登記表就跳過
      try {
        const sug = await generateSuggestion({
          url: p.url,
          label: p.label,
          title: p.title,
          description: p.description,
          keywords: p.keywords,
          h1: p.h1,
          content: p.content,
        });
        const put = (idx: number, val: string) => {
          if (idx >= 0) data.push({ range: `${tabRef(tabName)}!${colLetter(idx)}${sheetRow}`, values: [[val]] });
        };
        put(idxT, sug.title);
        put(idxD, sug.description);
        put(idxK, sug.keywords);
        put(idxH, sug.h1);
        results.push({ url: p.url, label: p.label, ok: true });
      } catch (e) {
        results.push({ url: p.url, label: p.label, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await batchUpdateValues(sheetId, data);

    return NextResponse.json({
      ok: true,
      tabName,
      count: results.filter((r) => r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
