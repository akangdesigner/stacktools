import { NextRequest, NextResponse } from 'next/server';
import { runHtmlRules, LEVEL, CATEGORY, type CheckResult } from '@/lib/site-audit-rules';
import { runAiChecks } from '@/lib/site-audit-ai';

// 網站技術健檢 API：輸入單一網址 → 抓該頁 HTML + 站台檔案 HTTP → 規則層 + AI 層 → 回傳各項結果。
// 輸出欄位對齊「網站技術優化進度」表：影響層級 / 分類 / 狀態 / 確認事項 / SEO 建議事項。
// 單頁健檢很快，但 AI 判斷最多 60 秒，保守給 120 秒上限。
export const maxDuration = 120;

// 抓網頁時偽裝成瀏覽器，避免被某些網站擋掉（與 TKD 工具一致）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 帶逾時的 fetch，避免單一請求卡死整個健檢
async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

// 站台檔案項的固定欄位
type FileMeta = { key: string; level: string; category: string; item: string; path: string; missingStatus: 'fail' | 'warn' };

// 檢查站台根目錄檔案是否存在（sitemap.xml / robots.txt / llms.txt）
async function checkSiteFile(origin: string, meta: FileMeta): Promise<CheckResult> {
  const url = `${origin}${meta.path}`;
  const base = { key: meta.key, level: meta.level, category: meta.category, item: meta.item };
  try {
    const res = await fetchWithTimeout(url, 10000);
    return res.ok
      ? { ...base, status: 'ok', advice: `${meta.path} 存在（HTTP ${res.status}）`, evidence: url }
      : { ...base, status: meta.missingStatus, advice: `${meta.path} 不存在或無法存取（HTTP ${res.status}）`, evidence: url };
  } catch {
    return { ...base, status: meta.missingStatus, advice: `${meta.path} 連線失敗`, evidence: url };
  }
}

// 站台檔案三項定義
const SITE_FILES: FileMeta[] = [
  { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap', path: '/sitemap.xml', missingStatus: 'fail' },
  { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '建立 robots.txt', path: '/robots.txt', missingStatus: 'fail' },
  { key: 'llms', level: LEVEL.RANK, category: CATEGORY.TECH, item: '網站根目錄有無部署 llms.txt', path: '/llms.txt', missingStatus: 'warn' },
];

// 頁面可存取性（對應表上「有無網址 404」）
const PAGE_BASE = { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有無網址 404' };

// 最終輸出依表順序排列（key → 次序）
const ORDER = ['analytics', 'tkd', 'sitemap', 'robots', 'llms', 'headings', 'schema', 'page', 'viewport', 'breadcrumb', 'imgAlt', 'imgFormat', 'eeat'];
function sortByTable(checks: CheckResult[]): CheckResult[] {
  return [...checks].sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { url?: string };
  const input = body.url?.trim();
  if (!input) return NextResponse.json({ error: '請輸入要健檢的網址' }, { status: 400 });

  // 正規化網址：補 https://、保留路徑
  let pageUrl = input;
  if (!/^https?:\/\//i.test(pageUrl)) pageUrl = 'https://' + pageUrl;

  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 });
  }

  // ── 站台檔案檢查（不依賴頁面 HTML，可與抓頁並行）──
  const siteFilesPromise = Promise.all(SITE_FILES.map((m) => checkSiteFile(origin, m)));

  // ── 抓目標頁 HTML ──
  let html = '';
  let pageStatus: CheckResult;
  try {
    const res = await fetchWithTimeout(pageUrl);
    html = await res.text();
    pageStatus = res.ok
      ? { ...PAGE_BASE, status: 'ok', advice: `頁面正常回應（HTTP ${res.status}）`, evidence: pageUrl }
      : { ...PAGE_BASE, status: 'fail', advice: `頁面回應異常（HTTP ${res.status}）`, evidence: pageUrl };
  } catch {
    // 抓不到頁面：只回頁面狀態 + 站台檔案，跳過規則/AI（沒有 HTML 可判）
    const siteFiles = await siteFilesPromise;
    return NextResponse.json({
      url: pageUrl,
      checks: sortByTable([
        { ...PAGE_BASE, status: 'fail', advice: '無法連線或逾時，抓不到頁面內容', evidence: pageUrl },
        ...siteFiles,
      ]),
    });
  }

  // ── 規則層 ──
  const rule = runHtmlRules(html);

  // ── AI 層（與站台檔案並行等待）──
  const [aiChecks, siteFiles] = await Promise.all([
    runAiChecks({ url: pageUrl, jsonLdTypes: rule.jsonLdTypes, jsonLdRaw: rule.jsonLdRaw, mainText: rule.mainText }),
    siteFilesPromise,
  ]);

  const checks = sortByTable([pageStatus, ...rule.checks, ...aiChecks, ...siteFiles]);

  return NextResponse.json({ url: pageUrl, checks });
}
