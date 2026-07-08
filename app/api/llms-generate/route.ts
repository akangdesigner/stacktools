import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '@/lib/site-audit-crawler';
import { fetchPageSearchStats } from '@/lib/site-audit-gsc';
import { curateLlmsTxt, supplementFromSitemap, createLlmsJob, updateLlmsJob, getLlmsJob } from '@/lib/llms-generator';

// llms.txt 產生 API（複用 site-audit 全站爬蟲）
// POST { url } → 開背景 job → 立即回 jobId；背景從首頁 BFS 爬第一～二層（上限 300 頁）→
//   把每頁 title/description 組成 llms.txt。
// GET ?id=llms_xxx → 輪詢進度與結果。
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要產生 llms.txt 的網址' }, { status: 400 });

  let pageUrl = input;
  if (!/^https?:\/\//i.test(pageUrl)) pageUrl = 'https://' + pageUrl;
  try {
    new URL(pageUrl);
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  const job = createLlmsJob(pageUrl);

  // ── 背景執行（不 await，讓請求先回 jobId）──
  void (async () => {
    try {
      // 先查 GSC（很快，一支 API）：讓前端輸入網址後馬上知道有沒有找到搜尋成效資源
      updateLlmsJob(job.id, { status: 'checking-gsc', message: '查詢 GSC 授權…' });
      const { property, stats } = await fetchPageSearchStats(pageUrl);
      updateLlmsJob(job.id, {
        gsc: { found: !!property, property: property ?? undefined, pages: stats.size },
        message: property
          ? `已找到 GSC 資源：${property}（${stats.size} 頁有搜尋數據），開始爬取網站…`
          : '此網域不在 GSC 授權帳號內，將產出純爬蟲版，開始爬取網站…',
      });

      const crawl = await crawlSite(pageUrl, {
        maxPages: 300,
        maxDepth: 2,
        concurrency: 8,
        onProgress: (p) =>
          updateLlmsJob(job.id, { status: 'crawling', progress: p, message: `已爬 ${p.crawled} 頁（發現 ${p.discovered} 頁）…` }),
      });
      // sitemap 補頁：把 BFS 爬不到但 sitemap 有的頁補抓進來（91APP 等 JS 選單站關鍵）
      const supplemented = await supplementFromSitemap(crawl, (done, total, capped) =>
        updateLlmsJob(job.id, {
          status: 'supplementing',
          message: `從 sitemap 補抓爬不到的頁：${done}/${total}${capped > 0 ? `（另有 ${capped} 頁超過上限未補）` : ''}…`,
        }),
      );
      const merged = { ...crawl, pages: [...crawl.pages, ...supplemented] };

      updateLlmsJob(job.id, { status: 'building', message: 'AI 策展中（語意分類、精選、商品收斂）…' });
      const result = await curateLlmsTxt(merged, stats);
      updateLlmsJob(job.id, {
        status: 'completed',
        result,
        message: `完成，收錄 ${result.pageCount} 條（${result.curated ? 'AI 策展版' : '規則版'}${result.usedGsc ? '、含 GSC 曝光' : ''}）`,
      });
    } catch (e) {
      updateLlmsJob(job.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), message: '產生失敗' });
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 job id' }, { status: 400 });

  const job = getLlmsJob(id);
  if (!job) return NextResponse.json({ error: '找不到這個工作（可能已過期，請重新產生）' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: job.status,
    message: job.message,
    progress: job.progress,
    url: job.url,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.error,
  });
}
