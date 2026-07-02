import { NextRequest, NextResponse } from 'next/server';
import { collectUrls, fetchAllTkd, prettyUrl, normalizeSite } from '@/lib/tkd-crawler';
import {
  extractSheetId,
  extractGid,
  resolveTabName,
  readHeaders,
  appendRows,
  clearRowsOfSite,
} from '@/lib/tkd-sheet';
import { generateSuggestion } from '@/lib/tkd-suggest';

// 爬多頁可能較久，放寬這支 route 的執行時間上限
export const maxDuration = 300;

// 頁數硬上限，避免不小心對超大站台爬爆
const MAX_LIMIT = 300;

// 把表頭字串正規化（去空白、轉小寫）方便比對
function norm(s: string): string {
  return (s || '').replace(/\s+/g, '').toLowerCase();
}

// 在表頭中找出目標欄位的索引；predicate 收到正規化後的表頭字串
function findCol(headers: string[], predicate: (h: string) => boolean): number {
  return headers.findIndex((h) => predicate(norm(h)));
}

// 產生 Google Sheet 的 HYPERLINK 公式（雙引號需用兩個雙引號跳脫）
function sheetLink(url: string, text: string): string {
  const q = (s: string) => (s ?? '').replace(/"/g, '""');
  return `=HYPERLINK("${q(url)}","${q(text || url)}")`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteUrl?: string;
      sheetUrl?: string;
      limit?: number;
      scope?: 'important' | 'all';
      dryRun?: boolean;
      // 已在第①步（/api/tkd/collect）勾選好的頁面清單；有帶就直接用，不再重新蒐集
      pages?: { url: string; label?: string }[];
    };
    const siteUrl = body.siteUrl?.trim();
    const sheetUrl = body.sheetUrl?.trim();

    if (!siteUrl) return NextResponse.json({ error: '請輸入客戶網址' }, { status: 400 });
    if (!sheetUrl) return NextResponse.json({ error: '請輸入登記表網址' }, { status: 400 });

    const limit = Math.min(body.limit && body.limit > 0 ? body.limit : 100, MAX_LIMIT);
    const scope = body.scope === 'all' ? 'all' : 'important';
    const dryRun = body.dryRun === true; // 只抓取預覽、不寫回 sheet

    // 1. 頁面清單：優先用第①步勾選好的清單；沒帶才自己蒐集（相容直接呼叫這支 API 的舊用法）
    const urls =
      body.pages && body.pages.length > 0
        ? body.pages.map((p) => ({ url: p.url, label: p.label }))
        : await collectUrls(siteUrl, limit, scope);
    if (urls.length === 0) {
      return NextResponse.json(
        { error: '找不到任何頁面，請確認網址是否正確，或該站是否有 sitemap.xml' },
        { status: 400 },
      );
    }

    // 2. 逐頁抓現有 TKD
    const pages = await fetchAllTkd(urls);

    // 3. 解析登記表：找到分頁與表頭
    const sheetId = extractSheetId(sheetUrl);
    const gid = extractGid(sheetUrl);
    const tabName = await resolveTabName(sheetId, gid);
    const headers = await readHeaders(sheetId, tabName);
    if (headers.length === 0) {
      return NextResponse.json(
        { error: '讀不到登記表表頭，請確認分頁與網址是否正確' },
        { status: 400 },
      );
    }

    // 4. 對應各欄位索引（依表頭關鍵字，容忍空白與大小寫）
    const idxPage = findCol(headers, (h) => h.includes('頁面') || h.includes('網址') || h.includes('url'));
    const idxTitle = findCol(headers, (h) => h.includes('現有') && h.includes('title'));
    const idxDesc = findCol(headers, (h) => h.includes('現有') && h.includes('description'));
    const idxKw = findCol(headers, (h) => h.includes('現有') && h.includes('keywords'));
    const idxH1 = findCol(headers, (h) => h.includes('現有') && h.includes('h1'));
    // 建議欄索引
    const idxSugT = findCol(headers, (h) => h.includes('建議') && h.includes('title'));
    const idxSugD = findCol(headers, (h) => h.includes('建議') && h.includes('description'));
    const idxSugK = findCol(headers, (h) => h.includes('建議') && h.includes('keywords'));
    const idxSugH = findCol(headers, (h) => h.includes('建議') && h.includes('h1'));

    if (idxPage < 0) {
      return NextResponse.json(
        { error: '登記表找不到「頁面」欄位，無法寫回，請確認表頭' },
        { status: 400 },
      );
    }

    // 5. 逐頁組列：現有欄直接填；非預覽時再逐頁「依序」呼叫 AI 生成建議欄（不可並行，並行會被截短）
    const rows: string[][] = [];
    let suggested = 0;
    for (const p of pages) {
      const row = new Array(headers.length).fill('');
      // 頁面欄寫成「選單名＋超連結」；沒有選單名（全站模式）就用可讀網址當顯示文字
      row[idxPage] = sheetLink(p.url, p.label || prettyUrl(p.url));
      if (idxTitle >= 0) row[idxTitle] = p.title;
      if (idxDesc >= 0) row[idxDesc] = p.description;
      if (idxKw >= 0) row[idxKw] = p.keywords;
      if (idxH1 >= 0) row[idxH1] = p.h1;
      if (!dryRun) {
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
          if (idxSugT >= 0) row[idxSugT] = sug.title;
          if (idxSugD >= 0) row[idxSugD] = sug.description;
          if (idxSugK >= 0) row[idxSugK] = sug.keywords;
          if (idxSugH >= 0) row[idxSugH] = sug.h1;
          suggested++;
        } catch {
          // 建議生成失敗就留空，不影響現有欄寫入
        }
      }
      rows.push(row);
    }

    // 寫入前先清掉這個登記表裡「同一網站」的舊列，避免重跑時重複疊加
    let cleared = 0;
    if (!dryRun) {
      const host = (() => {
        try { return new URL(normalizeSite(siteUrl)).host; } catch { return ''; }
      })();
      cleared = await clearRowsOfSite(sheetId, tabName, idxPage, host);
      await appendRows(sheetId, tabName, rows);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      tabName,
      cleared,
      pageCount: urls.length,
      wroteCount: dryRun ? 0 : rows.length,
      suggested: dryRun ? 0 : suggested,
      matched: {
        頁面: idxPage >= 0,
        現有title: idxTitle >= 0,
        現有description: idxDesc >= 0,
        現有keywords: idxKw >= 0,
        現有H1: idxH1 >= 0,
      },
      pages: pages.map((p) => ({ ...p, url: prettyUrl(p.url) })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
