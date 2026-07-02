import { NextRequest, NextResponse } from 'next/server';
import { collectCandidates, collectUrls, normalizeSite } from '@/lib/tkd-crawler';
import { classifyPages, classifyByRules } from '@/lib/tkd-classify';

// 第①步：蒐集候選頁面＋AI 判斷型態與是否收錄，回傳清單讓使用者勾選。
// 勾選完成後再由 /api/tkd 帶 pages 進行第②步（爬 TKD＋AI 建議＋寫回登記表）
export const maxDuration = 120;

// 頁數硬上限，避免不小心對超大站台爬爆
const MAX_LIMIT = 300;

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

    if (scope === 'all') {
      // 全站模式：sitemap 全收，不經 AI（頁數可能很多），型態用規則粗分、預設全勾
      const urls = await collectUrls(site, limit, 'all');
      if (urls.length === 0) {
        return NextResponse.json(
          { error: '找不到任何頁面，請確認網址是否正確，或該站是否有 sitemap' },
          { status: 400 },
        );
      }
      const pages = classifyByRules(urls, site).map((p) => ({ ...p, include: true }));
      return NextResponse.json({ ok: true, scope, pageCount: pages.length, pages });
    }

    // 重點頁模式：選單＋sitemap 蒐集候選 → AI 分類。
    // 候選放寬到上限的 3 倍：sitemap 排前面的部落格單篇會被 AI 排除，
    // 不放寬的話它們會先佔掉額度、把排後面的產品頁擠掉；最終寫入量由使用者勾選控制
    const candidates = await collectCandidates(site, Math.min(limit * 3, MAX_LIMIT));
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: '找不到任何頁面，請確認網址是否正確' },
        { status: 400 },
      );
    }
    const pages = await classifyPages(candidates, site);
    return NextResponse.json({ ok: true, scope, pageCount: pages.length, pages });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
