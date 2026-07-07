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
import { generateSuggestion, type TkdSuggestion } from '@/lib/tkd-suggest';
import { createTkdJob, progressTkdJob, completeTkdJob, failTkdJob, getTkdJob } from '@/lib/tkd-jobs';
import { getDraft, type DraftPage } from '@/lib/tkdDb';

// 爬多頁會跑很久，改成背景任務：POST 立刻回 jobId，前端用 GET ?id= 輪詢進度，
// 避免撞 Zeabur 閘道逾時（約 60 秒就回 502 Bad Gateway）
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

// 整段爬取＋（視階段）AI 建議＋寫表的管線（在背景執行，進度寫回任務表）
// stage='existing'：只寫現有 TKD、不生建議，寫完存一筆草稿（階段一）
// stage='suggest' ：重爬頁面→生建議→寫回現有＋建議欄（階段二，可帶 draftId 從草稿載入）
async function runPipeline(
  jobId: string,
  params: {
    siteUrl: string;
    sheetUrl: string;
    limit: number;
    scope: 'important' | 'all';
    dryRun: boolean;
    extraKeywords: string;
    notes: string;
    stage: 'existing' | 'suggest';
    draftId?: number;
    pages?: DraftPage[];
  },
): Promise<void> {
  const { siteUrl, sheetUrl, limit, scope, dryRun, extraKeywords, notes, stage } = params;

  // 頁面清單來源優先序：draftId（階段二從草稿載入）＞ 直接帶的勾選頁 ＞ 自己蒐集（舊用法）
  const draftPages = params.draftId ? getDraft(params.draftId)?.pages : undefined;
  const selectedPages = draftPages ?? params.pages;

  // 1. 頁面清單
  const urls =
    selectedPages && selectedPages.length > 0
      ? selectedPages.map((p) => ({ url: p.url, label: p.label }))
      : await collectUrls(siteUrl, limit, scope);
  if (urls.length === 0) {
    throw new Error('找不到任何頁面，請確認網址是否正確，或該站是否有 sitemap.xml');
  }

  // 2. 逐頁抓現有 TKD
  progressTkdJob(jobId, `爬取 ${urls.length} 頁的現有 TKD 中…`, 0, urls.length);
  const pages = await fetchAllTkd(urls);

  // 只預覽模式：sheet 網址留空＝只跑 AI 生成、結果顯示在畫面上，完全不讀/寫登記表（測試用）
  const previewOnly = !sheetUrl || sheetUrl.trim() === '';

  // 3. 解析登記表：找到分頁與表頭（只預覽模式跳過，欄位索引全給 -1）
  let sheetId = '';
  let tabName = '';
  let idxPage = -1;
  let idxNum = -1;
  let idxTitle = -1;
  let idxDesc = -1;
  let idxKw = -1;
  let idxH1 = -1;
  let idxSugT = -1;
  let idxSugD = -1;
  let idxSugK = -1;
  let idxSugH = -1;
  let headerLen = 0; // 登記表欄數（只預覽模式無表頭＝0，組出的列不會寫回）
  if (!previewOnly) {
    sheetId = extractSheetId(sheetUrl);
    const gid = extractGid(sheetUrl);
    tabName = await resolveTabName(sheetId, gid);
    const headers = await readHeaders(sheetId, tabName);
    if (headers.length === 0) {
      throw new Error('讀不到登記表表頭，請確認分頁與網址是否正確');
    }
    headerLen = headers.length;

    // 4. 對應各欄位索引（依表頭關鍵字，容忍空白與大小寫）
    idxPage = findCol(headers, (h) => h.includes('頁面') || h.includes('網址') || h.includes('url'));
    // 「#」序號欄（也接受 編號／序號／項次／no）：照寫入順序填 1、2、3…
    idxNum = findCol(headers, (h) => h === '#' || h.includes('編號') || h.includes('序號') || h.includes('項次') || h === 'no');
    idxTitle = findCol(headers, (h) => h.includes('現有') && h.includes('title'));
    idxDesc = findCol(headers, (h) => h.includes('現有') && h.includes('description'));
    idxKw = findCol(headers, (h) => h.includes('現有') && h.includes('keywords'));
    idxH1 = findCol(headers, (h) => h.includes('現有') && h.includes('h1'));
    // 建議欄索引
    idxSugT = findCol(headers, (h) => h.includes('建議') && h.includes('title'));
    idxSugD = findCol(headers, (h) => h.includes('建議') && h.includes('description'));
    idxSugK = findCol(headers, (h) => h.includes('建議') && h.includes('keywords'));
    idxSugH = findCol(headers, (h) => h.includes('建議') && h.includes('h1'));

    if (idxPage < 0) {
      throw new Error('登記表找不到「頁面」欄位，無法寫回，請確認表頭');
    }
  }

  // 5. 逐頁組列：現有欄直接填；非預覽時再逐頁「依序」呼叫 AI 生成建議欄（不可並行，並行會被截短）
  const rows: string[][] = [];
  const sugList: (TkdSuggestion | undefined)[] = []; // 每頁的建議值，跟 pages 同順序，回傳給前端顯示
  let suggested = 0;
  let doneCount = 0;
  for (const p of pages) {
    const row = new Array(headerLen).fill('');
    // 「#」欄照寫入順序放流水號（1 起算）
    if (idxNum >= 0) row[idxNum] = String(rows.length + 1);
    // 頁面欄寫成「選單名＋超連結」；沒有選單名（全站模式）就用可讀網址當顯示文字
    row[idxPage] = sheetLink(p.url, p.label || prettyUrl(p.url));
    if (idxTitle >= 0) row[idxTitle] = p.title;
    if (idxDesc >= 0) row[idxDesc] = p.description;
    if (idxKw >= 0) row[idxKw] = p.keywords;
    if (idxH1 >= 0) row[idxH1] = p.h1;
    let sug: TkdSuggestion | undefined;
    // 只有階段二（suggest）才生建議；階段一（existing）只寫現有欄
    if (stage === 'suggest' && !dryRun) {
      progressTkdJob(jobId, `AI 生成建議中（${doneCount + 1}／${pages.length} 頁）`, doneCount, pages.length);
      try {
        sug = await generateSuggestion({
          url: p.url,
          label: p.label,
          title: p.title,
          description: p.description,
          keywords: p.keywords,
          h1: p.h1,
          content: p.content,
          extraKeywords: extraKeywords || undefined,
          notes: notes || undefined,
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
    doneCount++;
    rows.push(row);
    sugList.push(sug);
  }

  // 寫入前先清掉這個登記表裡「同一網站」的舊列，避免重跑時重複疊加
  let cleared = 0;
  if (!dryRun && !previewOnly) {
    progressTkdJob(jobId, '寫入登記表中…', pages.length, pages.length);
    const host = (() => {
      try { return new URL(normalizeSite(siteUrl)).host; } catch { return ''; }
    })();
    cleared = await clearRowsOfSite(sheetId, tabName, idxPage, host);
    await appendRows(sheetId, tabName, rows);
  }

  // 草稿改由使用者自己按「儲存草稿」建立（POST /api/tkd/drafts），這裡不自動建
  const draftId: number | undefined = params.draftId;

  completeTkdJob(
    jobId,
    {
      ok: true,
      dryRun,
      previewOnly, // 只預覽模式（sheet 留空）：只生成、沒寫回
      stage,
      draftId,
      tabName,
      cleared,
      pageCount: urls.length,
      wroteCount: dryRun || previewOnly ? 0 : rows.length,
      suggested: dryRun ? 0 : suggested,
      matched: {
        頁面: idxPage >= 0,
        現有title: idxTitle >= 0,
        現有description: idxDesc >= 0,
        現有keywords: idxKw >= 0,
        現有H1: idxH1 >= 0,
      },
      pages: pages.map((p, i) => ({ ...p, url: prettyUrl(p.url), suggest: sugList[i] })),
    },
    previewOnly ? '僅預覽完成（未寫回登記表）' : `已完成，共寫入 ${dryRun ? 0 : rows.length} 列`,
  );
}

// 啟動任務：驗證參數後立刻回 jobId，管線丟到背景跑
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteUrl?: string;
      sheetUrl?: string;
      limit?: number;
      scope?: 'important' | 'all';
      dryRun?: boolean;
      // 階段：existing＝只寫現有 TKD＋存草稿；suggest＝生建議寫回（預設 suggest，相容舊用法）
      stage?: 'existing' | 'suggest';
      // 階段二從草稿載入頁面清單用
      draftId?: number;
      // 已在第①步（/api/tkd/collect）勾選好的頁面清單；有帶就直接用，不再重新蒐集
      pages?: DraftPage[];
      // 使用者指定要納入建議 TKD 的關鍵字（逗號分隔，全站每頁共用）
      extraKeywords?: string;
      // 微調：使用者的修正指示（自由文字），生建議時 AI 必須遵守
      notes?: string;
    };
    const siteUrl = body.siteUrl?.trim();
    const sheetUrl = body.sheetUrl?.trim();

    if (!siteUrl) return NextResponse.json({ error: '請輸入客戶網址' }, { status: 400 });
    if (!sheetUrl) return NextResponse.json({ error: '請輸入登記表網址' }, { status: 400 });

    const limit = Math.min(body.limit && body.limit > 0 ? body.limit : 100, MAX_LIMIT);
    const scope = body.scope === 'all' ? 'all' : 'important';
    const dryRun = body.dryRun === true; // 只抓取預覽、不寫回 sheet
    const stage = body.stage === 'existing' ? 'existing' : 'suggest';
    const draftId = typeof body.draftId === 'number' ? body.draftId : undefined;
    // 指定關鍵字：逗號（半形/全形）或空白（含換行）都可分隔，整理成「半形逗號＋空格」，去掉空項
    const extraKeywords = (body.extraKeywords || '')
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');
    const notes = (body.notes || '').trim();

    const job = createTkdJob('準備頁面清單中…');
    // 刻意不 await：讓管線在背景跑完，進度與結果都寫回任務表
    runPipeline(job.id, { siteUrl, sheetUrl, limit, scope, dryRun, extraKeywords, notes, stage, draftId, pages: body.pages })
      .catch((e) => failTkdJob(job.id, e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 查詢任務進度／結果
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少任務 id' }, { status: 400 });
  const job = getTkdJob(id);
  if (!job) return NextResponse.json({ error: '找不到這個任務（可能已過期，請重新執行）' }, { status: 404 });
  return NextResponse.json(job);
}
