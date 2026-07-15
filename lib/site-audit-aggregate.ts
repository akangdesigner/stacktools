import { LEVEL, CATEGORY, STAGE_OF, ITEM_ORDER, type CheckResult } from './site-audit-rules';
import { runAiChecks } from './site-audit-ai';
import { runGscChecks, filterIndexedByGsc, type GscChecks } from './site-audit-gsc';
import { normalizeUrl, type CrawlResult } from './site-audit-crawler';

// ── 網站技術健檢：全站彙總層 ────────────────────────────
// 吃 crawlSite 的整包爬取資料，逐項彙總成「總體」結論（例：TKD＝「X/Y 頁 title 留空或過長」）。
// 輸出對齊「網站技術優化進度」表 22 項，每項帶所屬階段（stage）。
// Schema 與 E-E-A-T 兩項語意題交給 AI（取樣首頁等頁面）。

// 依進度表順序排序，並補上階段
const ORDER = ITEM_ORDER.map((x) => x.key);
function sortByTable(checks: CheckResult[]): CheckResult[] {
  return [...checks]
    .map((c) => ({ ...c, stage: STAGE_OF[c.key] ?? c.stage }))
    .sort((a, b) => (ORDER.indexOf(a.key) === -1 ? 99 : ORDER.indexOf(a.key)) - (ORDER.indexOf(b.key) === -1 ? 99 : ORDER.indexOf(b.key)));
}

// 網址顯示成路徑（去掉網域）
function toPath(origin: string, u: string): string {
  return normalizeUrl(u).replace(origin, '') || '/';
}

// LocalBusiness 及常見子型別
const LOCAL_TYPES = ['LocalBusiness', 'Store', 'Restaurant', 'Dentist', 'MedicalClinic', 'HealthAndBeautyBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'JewelryStore'];

export async function aggregateChecks(
  crawl: CrawlResult,
  stage: number,
  onProgress?: (msg: string) => void,
): Promise<CheckResult[]> {
  const inStage = (key: string) => stage === 0 || STAGE_OF[key] === stage;
  const { origin, pages, sitemapUrls, sitemapExists, robotsExists, llmsExists, reachedCap } = crawl;

  const htmlPages = pages.filter((p) => p.ok && (p.title || p.h1 || p.imgTotal || p.mainText)); // 有內容的頁
  const Y = htmlPages.length || 1; // 分母（避免除以 0）
  const rangeNote = reachedCap ? `（已達爬取上限 ${pages.length} 頁，可能未涵蓋整站）` : `（爬取範圍：${pages.length} 頁）`;

  const out: CheckResult[] = [];
  const push = (c: CheckResult) => {
    if (inStage(c.key)) out.push(c);
  };

  // ── 先取 GSC 官方資料（索引 / Schema / 重複內容 / Sitemap），查不到的項目回 undefined，各自退回爬蟲/AI ──
  let gsc: GscChecks = {};
  const needGsc = ['indexing', 'schema', 'duplicate', 'sitemap'].some((k) => inStage(k));
  if (needGsc) {
    onProgress?.('查詢 GSC 官方資料中…');
    try {
      gsc = await runGscChecks(
        origin,
        sitemapUrls,
        60, // 跨站抽樣 60 頁估算收錄率（兼顧速度與代表性；URL 檢測每個都慢，不宜全查）
        { indexing: inStage('indexing'), schema: inStage('schema'), duplicate: inStage('duplicate'), sitemap: inStage('sitemap') },
        (done, total) => onProgress?.(`GSC 檢測收錄中 ${done}/${total}…`),
      );
    } catch {
      gsc = {}; // GSC 全掛就退回爬蟲/AI
    }
  }

  // ── 階段一 ──

  // 1. GA / GSC
  const analytics = [...new Set(pages.flatMap((p) => p.analytics))];
  push(analytics.length
    ? { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '網站有無串接GA、GSC等資料分析軟體', status: 'ok', advice: `全站偵測到：${analytics.join('、')}`, evidence: analytics.join('、') }
    : { key: 'analytics', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: '網站有無串接GA、GSC等資料分析軟體', status: 'fail', advice: '全站原始碼找不到 GA4 / GTM / GSC 追蹤碼', evidence: '（無）' });

  // 2. Sitemap：優先用 GSC 提交狀態，查不到退回「爬得到 sitemap.xml 檔案」判斷
  push(gsc.sitemap ?? (sitemapExists && sitemapUrls.length
    ? { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap', status: 'ok', advice: `sitemap.xml 存在，共 ${sitemapUrls.length} 個網址`, evidence: `${origin}/sitemap.xml` }
    : { key: 'sitemap', level: LEVEL.RANK, category: CATEGORY.TECH, item: '正確提交或建立 Sitemap', status: 'fail', advice: 'sitemap.xml 不存在或讀不到，建議建立並提交至 GSC', evidence: `${origin}/sitemap.xml` }));

  // 3. robots.txt
  push(robotsExists
    ? { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '建立 robots.txt', status: 'ok', advice: 'robots.txt 存在', evidence: `${origin}/robots.txt` }
    : { key: 'robots', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '建立 robots.txt', status: 'fail', advice: 'robots.txt 不存在或讀不到，建議建立', evidence: `${origin}/robots.txt` });

  // 4. 孤島頁面：sitemap 有、爬站觸及不到（爬到的頁 + 頁內所有內部連結）
  if (inStage('orphan')) {
    const base = { key: 'orphan', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有無孤島頁面' };
    if (!sitemapExists || sitemapUrls.length === 0) {
      push({ ...base, status: 'warn', advice: '找不到 sitemap.xml，無法比對孤島頁面，建議先建立 sitemap 再複核', evidence: `${origin}/sitemap.xml` });
    } else {
      // 孤島判斷只採計「首頁連結可達」的頁（viaSitemap=false）：
      // sitemap 補爬進來的頁不能當可達來源，否則每頁都被自己補爬成「可達」→ 孤島全消失。
      const reachable = new Set<string>();
      for (const p of pages) {
        if (p.viaSitemap) continue;
        reachable.add(normalizeUrl(p.url));
        for (const l of p.internalLinks) reachable.add(normalizeUrl(l));
      }
      const orphans = sitemapUrls.filter((u) => !reachable.has(normalizeUrl(u)));
      if (orphans.length === 0) {
        push({ ...base, status: 'ok', advice: `sitemap 頁面在首頁 2 層內皆有內部連結指向，未發現孤島${rangeNote}`, evidence: `sitemap ${sitemapUrls.length} 頁，爬站觸及 ${reachable.size} 個內部連結，疑似孤島 0 頁` });
      } else {
        // 用 GSC 交叉核對：靜態爬蟲看不到 JS 選單，會把主選單頁（/blogs 等）誤判成孤島；「已收錄」的剔除
        onProgress?.('GSC 交叉核對疑似孤島…');
        const chk = await filterIndexedByGsc(origin, orphans, 80, (d, t) => onProgress?.(`GSC 核對孤島 ${d}/${t}…`));
        if (chk.unavailable) {
          // 沒 GSC → 維持原本「疑似」清單並強調可能高估
          const samples = orphans.slice(0, 6).map((u) => toPath(origin, u));
          push({ ...base, status: 'warn', advice: `發現 ${orphans.length} 個疑似孤島頁面（sitemap 有、首頁 2 層內未連到），例如：${samples.join('、')}${orphans.length > 6 ? ' 等' : ''}；未接 GSC 無法過濾，JS 動態選單站可能高估，建議人工複核`, evidence: `疑似孤島 ${orphans.length} 頁（未經 GSC 核對）`, details: orphans.map((u) => ({ url: normalizeUrl(u), note: '疑似孤島（未經 GSC 核對，可能高估）' })) });
        } else {
          const checked = orphans.slice(0, 80);
          const real = checked.filter((u) => !chk.indexed.has(u)); // GSC 未收錄的才算真孤島候選
          const dropped = checked.length - real.length; // 已收錄被剔除（主選單頁等）
          const uncheckedTail = orphans.length - checked.length;
          const tailNote = uncheckedTail > 0 ? `、另 ${uncheckedTail} 個未核對` : '';
          if (real.length === 0) {
            push({ ...base, status: 'ok', advice: `未被內部連結指向的 ${orphans.length} 頁中，經 GSC 核對均已收錄（Google 找得到，非真孤島，多為 JS 選單頁）${tailNote}，未發現確定孤島`, evidence: `疑似 ${orphans.length}，GSC 已收錄剔除 ${dropped} 頁` });
          } else {
            const samples = real.slice(0, 6).map((u) => toPath(origin, u));
            push({ ...base, status: 'warn', advice: `發現 ${real.length} 個真正疑似孤島（sitemap 有、未被內部連結指向、且 GSC 未收錄），例如：${samples.join('、')}${real.length > 6 ? ' 等' : ''}；已剔除 ${dropped} 個已收錄頁（如主選單）${tailNote}，建議補內部連結`, evidence: `真孤島候選 ${real.length}、剔除已收錄 ${dropped}`, details: real.map((u) => ({ url: normalizeUrl(u), note: 'sitemap 有、未被內部連結指向、GSC 未收錄' })) });
          }
        }
      }
    }
  }

  // 5. 有無建立索引：優先用 GSC 實測收錄，查不到（未授權/無對應資源/無 sitemap）退回爬蟲 noindex 判斷
  if (inStage('indexing')) {
    const base = { key: 'indexing', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '有無建立索引' };
    if (gsc.indexing) {
      push(gsc.indexing);
    } else {
      const noindex = htmlPages.filter((p) => p.noindex);
      push(noindex.length
        ? { ...base, status: 'warn', advice: `${noindex.length}/${Y} 頁設有 noindex（會被排除索引），例如：${noindex.slice(0, 5).map((p) => toPath(origin, p.url)).join('、')}，請確認是否刻意；實際收錄建議 GSC 複核`, evidence: `${noindex.length}/${Y} 頁 noindex`, details: noindex.map((p) => ({ url: p.url, note: '設有 noindex，會被排除索引' })) }
        : { ...base, status: 'ok', advice: `爬取頁面未發現 noindex；實際收錄狀況建議以 GSC / site: 查詢人工複核${rangeNote}`, evidence: `0/${Y} 頁 noindex` });
    }
  }

  // 6. Local Business
  if (inStage('localbiz')) {
    const hit = [...new Set(pages.flatMap((p) => p.jsonLdTypes).filter((t) => LOCAL_TYPES.includes(t)))];
    const base = { key: 'localbiz', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: 'Local Business 標籤設定' };
    push(hit.length
      ? { ...base, status: 'warn', advice: `全站已部署 ${hit.join('、')} 標籤，欄位完整度（地址、電話、營業時間）建議人工複核`, evidence: hit.join('、') }
      : { ...base, status: 'fail', advice: '全站未偵測到 LocalBusiness 標籤，建議於後台基本資料設定並部署', evidence: '（無）' });
  }

  // 7. 麵包屑
  if (inStage('breadcrumb')) {
    const noBc = htmlPages.filter((p) => !p.hasBreadcrumb);
    const bc = Y - noBc.length;
    const base = { key: 'breadcrumb', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '有無麵包屑' };
    const noBcDetails = noBc.map((p) => ({ url: p.url, note: '未偵測到麵包屑' }));
    push(bc === 0
      ? { ...base, status: 'warn', advice: `爬取頁面皆未偵測到麵包屑（0/${Y}），建議加上 BreadcrumbList`, evidence: `0/${Y} 頁有麵包屑`, details: noBcDetails }
      : bc < Y
        ? { ...base, status: 'warn', advice: `僅 ${bc}/${Y} 頁有麵包屑，建議全站補齊`, evidence: `${bc}/${Y} 頁有麵包屑`, details: noBcDetails }
        : { ...base, status: 'ok', advice: `爬取頁面皆有麵包屑（${bc}/${Y}）`, evidence: `${bc}/${Y} 頁有麵包屑` });
  }

  // 8. 內部連結結構
  if (inStage('internalLinks')) {
    const noLink = htmlPages.filter((p) => p.internalLinks.length === 0);
    const avg = Math.round(htmlPages.reduce((s, p) => s + p.internalLinks.length, 0) / Y);
    const base = { key: 'internalLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '內部連結結構' };
    push(noLink.length
      ? { ...base, status: 'warn', advice: `有 ${noLink.length}/${Y} 頁沒有任何內部連結（平均每頁 ${avg} 條），建議補相關內容互連`, evidence: `平均 ${avg} 條/頁，${noLink.length} 頁無內部連結`, details: noLink.map((p) => ({ url: p.url, note: '沒有任何內部連結' })) }
      : { ...base, status: 'ok', advice: `內部連結結構合理（平均每頁約 ${avg} 條）`, evidence: `平均 ${avg} 條/頁` });
  }

  // 9. 無效連結檢查：爬取過程回應 4xx/5xx 的頁
  if (inStage('brokenLinks')) {
    const broken = pages.filter((p) => p.status >= 400);
    const base = { key: 'brokenLinks', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '無效連結檢查' };
    push(broken.length
      ? { ...base, status: 'fail', advice: `爬取 ${pages.length} 頁中有 ${broken.length} 頁連到壞頁（4xx/5xx），例如：${broken.slice(0, 5).map((p) => `${toPath(origin, p.url)}（${p.status || '連不上'}）`).join('、')}，建議修正或移除連結`, evidence: `${broken.length}/${pages.length} 頁異常`, details: broken.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })) }
      : { ...base, status: 'ok', advice: `爬取 ${pages.length} 頁未發現壞連結；全站連結建議人工複核`, evidence: `0/${pages.length} 頁異常` });
  }

  // 10. 檢查重複內容：優先用 GSC（Google canonical vs 你的 canonical），查不到退回爬蟲（缺 canonical + 重複標題）
  if (inStage('duplicate')) {
    if (gsc.duplicate) {
      push(gsc.duplicate);
    } else {
      const noCanonPages = htmlPages.filter((p) => !p.canonical);
      const noCanon = noCanonPages.length;
      const titleGroups = new Map<string, typeof htmlPages>();
      for (const p of htmlPages) if (p.title) {
        const g = titleGroups.get(p.title) ?? [];
        g.push(p);
        titleGroups.set(p.title, g);
      }
      const dupGroups = [...titleGroups.entries()].filter(([, g]) => g.length > 1);
      const dupTitleGroups = dupGroups.length;
      const base = { key: 'duplicate', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '檢查重複內容' };
      const problems: string[] = [];
      if (noCanon) problems.push(`${noCanon}/${Y} 頁未設 canonical`);
      if (dupTitleGroups) problems.push(`${dupTitleGroups} 組頁面標題重複`);
      // 明細：先列未設 canonical 的頁，再列標題重複的頁（附重複的標題）
      const dupDetails = [
        ...noCanonPages.map((p) => ({ url: p.url, note: '未設 canonical' })),
        ...dupGroups.flatMap(([title, g]) => g.map((p) => ({ url: p.url, note: `標題重複：${title}` }))),
      ];
      push(problems.length
        ? { ...base, status: 'warn', advice: `${problems.join('、')}，容易產生重複內容，建議補 canonical 並人工複核`, evidence: problems.join('、'), details: dupDetails }
        : { ...base, status: 'ok', advice: '頁面皆有 canonical、未發現重複標題；全站重複情形建議人工複核', evidence: `0 問題（共 ${Y} 頁）` });
    }
  }

  // ── 階段二 ──

  // 11. TKD 完整性
  if (inStage('tkd')) {
    const charLen = (s: string) => [...s.trim()].length;
    let te = 0, tl = 0, de = 0, dl = 0;
    const tkdDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (!p.title) { te++; probs.push('Title 留空'); }
      else if (charLen(p.title) > 30) { tl++; probs.push(`Title 過長（${charLen(p.title)} 字）`); }
      if (!p.description) { de++; probs.push('Description 留空'); }
      else if (charLen(p.description) > 80) { dl++; probs.push(`Description 過長（${charLen(p.description)} 字）`); }
      if (probs.length) tkdDetails.push({ url: p.url, note: probs.join('、') });
    }
    const base = { key: 'tkd', level: LEVEL.RANK, category: CATEGORY.TRACKING, item: 'TKD 完整性' };
    const issues = te + tl + de + dl;
    push(issues
      ? { ...base, status: 'fail', advice: `共 ${Y} 頁中：Title 留空 ${te}、過長(>30) ${tl}；Description 留空 ${de}、過長(>80) ${dl}，建議補齊並控制字數`, evidence: `T空${te}/長${tl}｜D空${de}/長${dl}（共 ${Y} 頁）`, details: tkdDetails }
      : { ...base, status: 'ok', advice: `爬取 ${Y} 頁 Title / Description 皆有填且長度適當`, evidence: `共 ${Y} 頁皆正常` });
  }

  // 12. h1、h2 使用
  if (inStage('headings')) {
    const noH1 = htmlPages.filter((p) => p.h1 === 0).length;
    const multiH1 = htmlPages.filter((p) => p.h1 > 1).length;
    const noH2 = htmlPages.filter((p) => p.h2 === 0).length;
    const base = { key: 'headings', level: LEVEL.RANK, category: CATEGORY.TECH, item: 'h1、h2 使用' };
    const problems: string[] = [];
    if (noH1) problems.push(`${noH1} 頁缺 h1`);
    if (multiH1) problems.push(`${multiH1} 頁有多個 h1`);
    if (noH2) problems.push(`${noH2} 頁缺 h2`);
    // 明細：逐頁列出標題結構問題
    const headingDetails: { url: string; note: string }[] = [];
    for (const p of htmlPages) {
      const probs: string[] = [];
      if (p.h1 === 0) probs.push('缺 h1');
      else if (p.h1 > 1) probs.push(`有 ${p.h1} 個 h1`);
      if (p.h2 === 0) probs.push('缺 h2');
      if (probs.length) headingDetails.push({ url: p.url, note: probs.join('、') });
    }
    push(problems.length
      ? { ...base, status: 'fail', advice: `共 ${Y} 頁中：${problems.join('、')}，建議補齊標題結構讓 Google 理解`, evidence: problems.join('、'), details: headingDetails }
      : { ...base, status: 'ok', advice: `爬取 ${Y} 頁標題結構完整`, evidence: `共 ${Y} 頁皆正常` });
  }

  // 13. 結構化數據（Schema）＝優先 GSC（Google 實際辨識到的型別）、退回 AI；22. E-E-A-T ＝ AI（取樣首頁等頁面）
  // 只有在「需要 AI」時才呼叫：eeat 一定要 AI；schema 只有在 GSC 沒給時才需要 AI
  const needSchemaAi = inStage('schema') && !gsc.schema;
  if (inStage('eeat') || needSchemaAi) {
    const home = htmlPages.find((p) => p.isHome) ?? htmlPages[0];
    const allTypes = [...new Set(pages.flatMap((p) => p.jsonLdTypes))];
    const sampleText = htmlPages.slice(0, 3).map((p) => p.mainText).join('\n\n').slice(0, 3000);
    const ai = await runAiChecks({
      url: home?.url ?? origin,
      jsonLdTypes: allTypes,
      jsonLdRaw: allTypes.length ? `全站偵測到的 Schema 型別：${allTypes.join('、')}` : '',
      mainText: sampleText,
    });
    if (needSchemaAi) {
      const aiSchema = ai.find((c) => c.key === 'schema');
      if (aiSchema) push(aiSchema);
    }
    const aiEeat = ai.find((c) => c.key === 'eeat');
    if (inStage('eeat') && aiEeat) push(aiEeat);
  }
  // Schema 有 GSC 結果就直接用
  if (inStage('schema') && gsc.schema) push(gsc.schema);

  // 14. llms.txt
  if (inStage('llms')) {
    const base = { key: 'llms', level: LEVEL.RANK, category: CATEGORY.TECH, item: '網站根目錄有無部署 llms.txt' };
    push(llmsExists
      ? { ...base, status: 'ok', advice: 'llms.txt 存在', evidence: `${origin}/llms.txt` }
      : { ...base, status: 'warn', advice: 'llms.txt 不存在，建議於根目錄部署（或用自訂網頁＋301 轉址達成）', evidence: `${origin}/llms.txt` });
  }

  // 15. 有無網址 404
  if (inStage('page')) {
    const bad = pages.filter((p) => p.status >= 400);
    const base = { key: 'page', level: LEVEL.QUALITY, category: CATEGORY.TECH, item: '有無網址 404' };
    push(bad.length
      ? { ...base, status: 'warn', advice: `爬取 ${pages.length} 頁中有 ${bad.length} 頁回應異常（含 404），例如：${bad.slice(0, 5).map((p) => `${toPath(origin, p.url)}（${p.status || '連不上'}）`).join('、')}`, evidence: `${bad.length}/${pages.length} 頁異常`, details: bad.map((p) => ({ url: p.url, note: `回應 ${p.status || '連不上'}` })) }
      : { ...base, status: 'ok', advice: `爬取 ${pages.length} 頁皆正常回應，未發現 404`, evidence: `0/${pages.length} 頁異常` });
  }

  // 16. 手機端優化（viewport）
  if (inStage('viewport')) {
    const noVp = htmlPages.filter((p) => !p.hasViewport);
    const vp = Y - noVp.length;
    const base = { key: 'viewport', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '手機端優化' };
    push(vp === Y
      ? { ...base, status: 'ok', advice: `爬取 ${Y} 頁皆有設定 viewport`, evidence: `${vp}/${Y} 頁` }
      : { ...base, status: 'warn', advice: `僅 ${vp}/${Y} 頁設定 viewport，其餘手機端排版可能異常`, evidence: `${vp}/${Y} 頁`, details: noVp.map((p) => ({ url: p.url, note: '缺少 viewport' })) });
  }

  // 17. 分類層級是否清楚
  if (inStage('categoryDepth')) {
    const depths = htmlPages.map((p) => {
      try {
        return new URL(p.url).pathname.split('/').filter(Boolean).length;
      } catch {
        return 0;
      }
    });
    const maxDepth = depths.length ? Math.max(...depths) : 0;
    const bc = htmlPages.filter((p) => p.hasBreadcrumb).length;
    const base = { key: 'categoryDepth', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: '分類層級是否清楚' };
    push(bc > 0 || maxDepth >= 1
      ? { ...base, status: 'ok', advice: `網址層級最深 ${maxDepth} 層、${bc}/${Y} 頁有麵包屑，分類尚屬清楚；整體架構建議人工複核`, evidence: `最深 ${maxDepth} 層｜麵包屑 ${bc}/${Y}` }
      : { ...base, status: 'warn', advice: '未偵測到明顯分類層級（網址扁平且無麵包屑），建議規劃清楚分類', evidence: `最深 ${maxDepth} 層` });
  }

  // 18. 首頁內容優化
  if (inStage('homepage')) {
    const home = pages.find((p) => p.isHome);
    const base = { key: 'homepage', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '首頁內容優化' };
    if (!home || !home.ok) {
      push({ ...base, status: 'warn', advice: '抓不到首頁內容，建議人工複核首頁', evidence: origin });
    } else {
      const problems: string[] = [];
      if (home.h1 === 0) problems.push('缺少 <h1>');
      else if (home.h1 > 1) problems.push(`<h1> 有 ${home.h1} 個`);
      if (home.h2 === 0) problems.push('缺少 <h2>');
      const evidence = `首頁 h1 × ${home.h1}，h2 × ${home.h2}`;
      push(problems.length
        ? { ...base, status: 'fail', advice: `首頁${problems.join('、')}，建議補齊標題結構`, evidence }
        : { ...base, status: 'ok', advice: '首頁標題結構完整；文案吸引力建議人工複核', evidence });
    }
  }

  // 19. 圖片 ALT 標記
  if (inStage('imgAlt')) {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const emptyImg = htmlPages.reduce((s, p) => s + p.imgAltEmpty, 0);
    const emptyPages = htmlPages.filter((p) => p.imgAltEmpty > 0);
    const pagesWithEmpty = emptyPages.length;
    const base = { key: 'imgAlt', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '圖片 ALT 標記' };
    push(emptyImg
      ? { ...base, status: 'fail', advice: `全站 ${emptyImg}/${totalImg} 張圖 alt 留空（分布於 ${pagesWithEmpty} 頁），Google 圖片搜尋無法抓取，建議補上描述性 alt`, evidence: `${emptyImg}/${totalImg} 張空白`, details: emptyPages.map((p) => ({ url: p.url, note: `${p.imgAltEmpty} 張圖 alt 留空` })) }
      : { ...base, status: 'ok', advice: `爬取頁面圖片皆有 alt（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張空白` });
  }

  // 20. 縮圖及多媒體優化
  if (inStage('imgFormat')) {
    const totalImg = htmlPages.reduce((s, p) => s + p.imgTotal, 0);
    const legacy = htmlPages.reduce((s, p) => s + p.imgLegacy, 0);
    const legacyPages = htmlPages.filter((p) => p.imgLegacy > 0);
    const base = { key: 'imgFormat', level: LEVEL.EFFICIENCY, category: CATEGORY.STRUCTURE, item: '縮圖及多媒體優化' };
    push(legacy
      ? { ...base, status: 'warn', advice: `全站 ${legacy}/${totalImg} 張圖為非 WebP/AVIF 格式，建議壓縮至 200KB 以下並改用現代格式`, evidence: `${legacy}/${totalImg} 張非現代格式`, details: legacyPages.map((p) => ({ url: p.url, note: `${p.imgLegacy} 張非現代格式` })) }
      : { ...base, status: 'ok', advice: `爬取頁面圖片皆為現代格式（共 ${totalImg} 張）`, evidence: `0/${totalImg} 張` });
  }

  // 21. 外部連結檢查
  if (inStage('externalLinks')) {
    const totalExt = htmlPages.reduce((s, p) => s + p.externalCount, 0);
    const base = { key: 'externalLinks', level: LEVEL.RANK, category: CATEGORY.CONTENT, item: '外部連結檢查' };
    push(totalExt === 0
      ? { ...base, status: 'warn', advice: '全站幾乎沒有外部連結，適度引用權威來源有助信任度，建議人工複核', evidence: '0 條外部連結' }
      : { ...base, status: 'ok', advice: `全站約 ${totalExt} 條外部連結，連結有效性與品質建議人工複核`, evidence: `約 ${totalExt} 條外部連結` });
  }

  return sortByTable(out);
}
