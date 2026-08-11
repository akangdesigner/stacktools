#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// schema-check 查首頁用的 JS 渲染子行程
//   有些平台（SHOPLINE 等）的 JSON-LD 是前端 JS 執行後才動態插入 DOM，伺服器端原始碼裡完全沒有，
//   純 fetch 抓不到。這支腳本用 jsdom 真的把頁面腳本跑一遍，跑完把渲染後的 HTML 印到 stdout。
//
//   刻意獨立成一支子行程（由 lib/site-audit-crawler.ts 的 fetchRenderedHtml 用 child_process
//   spawn 呼叫、限時未完成就 SIGKILL），不要 in-process 執行：客戶網站的第三方腳本（客服外掛、
//   recaptcha、廣告像素）常用「同步等待」的寫法呼叫外部伺服器，JS 是單一執行緒，卡住的話連我們
//   自己寫的計時器都排不進去執行、攔不住。只有作業系統層級砍行程才叫得動、不用等它自己配合。
//
// 用法：node scripts/render-jsonld.cjs <url>　（成功：印出渲染後 HTML 到 stdout, exit 0；失敗：exit 1，不印東西）
const { JSDOM, VirtualConsole } = require('jsdom');

// 客戶站的第三方腳本（實測踩過 Google Maps 的 performance.getEntriesByType 這類 jsdom 沒實作的
// API）有時會從非同步 callback 裡噴出沒接住的例外，會直接讓整個 Node process 崩潰、什麼都印不出來。
// 吞掉繼續跑，讓後面已經注入好的 schema 還有機會抓得到，不要因為某個壞掉的第三方外掛就整支報廢
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function main() {
  const url = process.argv[2];
  if (!url) process.exit(1);

  // 吞掉客戶站 JS 噴的錯誤（matchMedia/MessageChannel 等 jsdom 沒實作的瀏覽器 API），
  // 這支腳本的 stdout 只拿來傳渲染後 HTML，錯誤訊息別混進去
  const virtualConsole = new VirtualConsole();
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: { userAgent: UA },
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
  }
  if (!('MessageChannel' in window)) window.MessageChannel = MessageChannel;

  // 很多平台的 schema 是頁面載入完之後才用非同步 JS 插進 DOM，fromURL resolve 的當下不一定已插好。
  // 實測這個等待時間本身會因為當下網路狀況飄動（同一個網址前後兩次注入完成的時間點不一樣），
  // 想用「數量穩定就提早結束」的輪詢去縮短時間，結果常常在真正的 schema 插入前就誤判成穩定提早
  // 結束。改回固定等，抓寬一點（10 秒）換取結果穩定，反正這裡只查首頁一頁，不是在跑全站爬取
  await new Promise((r) => setTimeout(r, 10000));

  // stdout 接到管道（呼叫端用 child_process.spawn 的預設模式，跟終端機手動跑「重導向到檔案」不一樣）
  // 時是非同步寫入，渲染後 HTML 常常超過 1MB、超過管道緩衝區一次寫不完。write() 之後立刻 exit(0)
  // 會把還沒寫完的部分砍掉——這是 Node 官方文件明講的陷阱，exit() 不等未完成的 I/O。實測踩過這個
  // 坑：資料被腰斬在前段，後面才插入的 schema 就這樣不見了。改成等 write() 的 callback 真的確認資料
  // 已經交給底層再結束，管道／檔案兩種情況都穩
  await new Promise((resolve) => {
    process.stdout.write(window.document.documentElement.outerHTML, resolve);
  });
  process.exit(0);
}

main().catch(() => process.exit(1));
