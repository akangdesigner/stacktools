import { NextRequest, NextResponse } from 'next/server';
import { collectCandidates, collectUrls, filterOutNoindex, normalizeSite } from '@/lib/tkd-crawler';
import { classifyPages, classifyByRules } from '@/lib/tkd-classify';
import { createTkdJob, progressTkdJob, completeTkdJob, failTkdJob, getTkdJob } from '@/lib/tkd-jobs';

// 第①步：蒐集候選頁面＋AI 判斷型態與是否收錄，回傳清單讓使用者勾選。
// 慢站（sitemap 多＋noindex 逐頁檢查）會跑好幾分鐘，一樣走背景任務：
// POST 立刻回 jobId，前端用 GET ?id= 輪詢，避免撞 Zeabur 閘道逾時（502）
export const maxDuration = 300;

// 頁數硬上限，避免不小心對超大站台爬爆
const MAX_LIMIT = 300;

// 整段蒐集＋noindex 過濾＋分類的管線（在背景執行，進度寫回任務表）
async function runCollect(
  jobId: string,
  params: { site: string; limit: number; scope: 'important' | 'all' },
): Promise<void> {
  const { site, limit, scope } = params;

  if (scope === 'all') {
    // 全站模式：sitemap 全收，不經 AI（頁數可能很多），型態用規則粗分、預設全勾
    progressTkdJob(jobId, '從 sitemap 蒐集全站頁面中…');
    const urls = await collectUrls(site, limit, 'all');
    if (urls.length === 0) {
      throw new Error('找不到任何頁面，請確認網址是否正確，或該站是否有 sitemap');
    }
    progressTkdJob(jobId, `逐頁檢查 noindex 中（共 ${urls.length} 頁）…`, 0, urls.length);
    const kept = await filterOutNoindex(urls); // noindex 頁直接不列（客戶不給收錄的頁不進登記表）
    const pages = classifyByRules(kept, site).map((p) => ({ ...p, include: true }));
    completeTkdJob(jobId, { ok: true, scope, pageCount: pages.length, pages });
    return;
  }

  // 重點頁模式：選單＋sitemap 蒐集候選 → AI 分類。
  // 候選放寬到上限的 3 倍：sitemap 排前面的部落格單篇會被 AI 排除，
  // 不放寬的話它們會先佔掉額度、把排後面的產品頁擠掉；最終寫入量由使用者勾選控制
  progressTkdJob(jobId, '蒐集主選單與 sitemap 頁面中…');
  const candidates = await collectCandidates(site, Math.min(limit * 3, MAX_LIMIT));
  if (candidates.length === 0) {
    throw new Error('找不到任何頁面，請確認網址是否正確');
  }
  // noindex 頁在 AI 分類前就濾掉：清單乾淨、也省下分類的頁數
  progressTkdJob(jobId, `逐頁檢查 noindex 中（共 ${candidates.length} 頁）…`, 0, candidates.length);
  const kept = await filterOutNoindex(candidates);
  if (kept.length === 0) {
    throw new Error('蒐集到的頁面全是 noindex，沒有可收錄的頁');
  }
  progressTkdJob(jobId, `AI 判斷頁面型態中（共 ${kept.length} 頁）…`, 0, kept.length);
  const pages = await classifyPages(kept, site);
  completeTkdJob(jobId, { ok: true, scope, pageCount: pages.length, pages });
}

// 啟動蒐集任務：驗證參數後立刻回 jobId，管線丟到背景跑
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteUrl?: string;
      limit?: number;
      scope?: 'important' | 'all';
    };
    const siteUrl = body.siteUrl?.trim();
    if (!siteUrl) return NextResponse.json({ error: '請輸入客戶網址' }, { status: 400 });

    const limit = Math.min(body.limit && body.limit > 0 ? body.limit : 100, MAX_LIMIT);
    const scope = body.scope === 'all' ? 'all' : 'important';
    const site = normalizeSite(siteUrl);

    const job = createTkdJob('準備蒐集頁面…');
    // 刻意不 await：讓管線在背景跑完，進度與結果都寫回任務表
    runCollect(job.id, { site, limit, scope }).catch((e) =>
      failTkdJob(job.id, e instanceof Error ? e.message : String(e)),
    );

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 查詢任務進度／結果（任務表跟 /api/tkd 共用，用 jobId 區分）
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少任務 id' }, { status: 400 });
  const job = getTkdJob(id);
  if (!job) return NextResponse.json({ error: '找不到這個任務（可能已過期，請重新執行）' }, { status: 404 });
  return NextResponse.json(job);
}
