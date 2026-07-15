import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '@/lib/site-audit-crawler';
import { aggregateChecks } from '@/lib/site-audit-aggregate';
import { createAuditJob, updateAuditJob } from '@/lib/site-audit-jobs';

// 網站技術健檢 API（全站模式）：收 { url, stage } → 開背景 job → 立即回 jobId。
// 背景 job：從首頁 BFS 爬第一～二層（上限 300 頁）→ 彙總成 22 項總體結論 → 更新 job 進度。
// 前端輪詢 /api/site-audit/status?id= 拿進度與結果。
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string; stage?: number };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要健檢的網址' }, { status: 400 });

  // 階段：1＝基礎健檢（上半 10 項）、2＝結構與內容（下半 12 項），預設階段一
  const stage = body.stage === 2 ? 2 : 1;

  let pageUrl = input;
  if (!/^https?:\/\//i.test(pageUrl)) pageUrl = 'https://' + pageUrl;
  try {
    new URL(pageUrl);
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  const job = createAuditJob(stage, pageUrl);

  // ── 背景執行（不 await，讓請求先回 jobId）──
  void (async () => {
    try {
      const crawl = await crawlSite(pageUrl, {
        maxPages: 1000, // 大站涵蓋完整 sitemap（1446 頁的站約 2 分鐘內，8 分鐘輪詢上限內）
        maxDepth: 2,
        concurrency: 8,
        onProgress: (p) => updateAuditJob(job.id, { status: 'crawling', progress: p, message: `已爬 ${p.crawled} 頁（發現 ${p.discovered} 頁）…` }),
      });
      updateAuditJob(job.id, { status: 'analyzing', message: `已爬 ${crawl.pages.length} 頁，彙總分析中…` });
      const checks = await aggregateChecks(crawl, stage, (msg) => updateAuditJob(job.id, { status: 'analyzing', message: msg }));
      updateAuditJob(job.id, { status: 'completed', result: checks, message: `完成，爬取 ${crawl.pages.length} 頁、產出 ${checks.length} 項` });
    } catch (e) {
      updateAuditJob(job.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), message: '健檢失敗' });
    }
  })();

  return NextResponse.json({ ok: true, jobId: job.id, stage });
}
