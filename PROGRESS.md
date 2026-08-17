# Stacktools 開發進度

> 最後更新：2026-08-14

---

## 已完成功能

### 文章上架工具 `/article`
四步驟精靈：取得 HTML → 貼入清洗 → 替換圖片 → 輸出上架版本。
客戶設定存於 localStorage。

### IG 監控報告 `/ig`
查看追蹤帳號近期貼文成效（愛心、留言、觀看數、AI 摘要）。
資料來源由 N8N 寫入 Google Sheets CSV。

### 推薦文生成器 `/recommendation`
輸入標題、關鍵字、品牌等，呼叫 N8N Webhook → Claude API 產生推薦文章。
需設定環境變數：`N8N_WEBHOOK_URL`（正式）、`N8N_WEBHOOK_TEST_URL` + `N8N_WEBHOOK_USE_TEST=true`（測試）。

#### 待辦：新版三階段整合（2026-08-07 記錄）

目標三階段分工（小積木回憶的設計）：
1. **事前調查＋定標題**：品牌/資料調查，並在這階段把標題定下來（不是像現在一開始就要使用者打死標題）
2. **目錄 H2/H3**：大綱生成
3. **最後整合**：生成內文、貼 WordPress

現況落差（查 n8n stack.zeabur.app 後盤點）：
- App 現在第一階段（品牌＋大綱查詢）已改成**本地執行**（`lib/recommendation-step1.ts`，Tavily+OpenRouter），完全沒有「定標題」這個環節，標題是表單一開始就要求輸入。
- n8n 上對應的三支工作流：`推薦文-1-品牌查詢`（vTmYbkLW6Vuge3UR）、`推薦文-2-大綱生成`（xMK8p2scEcnEmkBa）、`推薦文-3-完整生成`（wHUHCGjX2iyiY7wA）都還是 active，但 App 目前只真的呼叫第 3 支；第 1、2 支處於斷點、沒被叫用。
- `推薦文-3-完整生成` 內部又重跑一次「品牌媒體研究員」＋「真實用戶體驗研究員」，跟本地 `lib/brand-info-fetcher.ts`（`fetch-brand-info` API）的官方資料抓取邏輯重複，多花一次 OpenRouter 額度與時間。
- 另有一支舊工作流 `推薦文資料查詢claude版`（An04JuI0KBKFbskv）是被取代的單一整合草稿版，貼文/回傳狀態節點都是 disabled，待確認是否要停用/封存避免混淆。

執行結果（2026-08-13，第一輪，方向後來被推翻）：
- [x] 「定標題」：`awaiting_confirm` 確認畫面加標題建議區塊，AI 生成 2～3 個標題建議可點選套用／手動編輯
- ~~[x] 第一階段維持本地執行~~ **後來推翻，見下方第二輪**
- ~~[x] 工作流3維持原樣不動~~ **後來推翻，見下方第二輪**
- [x] 舊工作流 `推薦文資料查詢claude版`（An04JuI0KBKFbskv）已停用（原本有個孤立節點擋住存檔，已補上工具建議的連接線後停用成功）

**第二輪修正（2026-08-13 當天稍晚）**：小積木指出方向錯了——目標輸出格式（參考 sunvita 膠原蛋白推薦文：每個品牌卡片含規格表＋媒體報導＋用戶評價）其實正好對應 `推薦文-3-完整生成` 現有的「轉化html卡片」產出。真正的問題是：
- App 第一階段土砲用 Tavily+Haiku 找品牌，完全沒接 `推薦文-1-品牌查詢`／`推薦文-2-大綱生成` 這兩支正式工作流
- `推薦文-1-品牌查詢` 內部其實已經內建「品牌媒體研究員」「真實用戶體驗研究員」深度研究，跟 `推薦文-3-完整生成` 裡同名節點是**真正的重複**（不是先前誤判的 fetch-brand-info）

修正後架構＋已執行：
- [x] `app/api/recommendation/route.ts` 改成打 n8n `rec-step1-brands`、`rec-step2-outline` 兩支 webhook（非同步，callback 機制原本就有接）
- [x] `lib/recommendation-jobs.ts` 確認畫面就緒條件加上等 `brandDetails`（品牌深度研究）到齊
- [x] `app/api/recommendation/generate/route.ts` 送出完整生成時把 `job.data.brandDetails` 一起帶給工作流3
- [x] `lib/recommendation-step1.ts` 精簡成只剩標題建議生成（`generateTitleSuggestions`），由 `app/api/recommendation/callback/route.ts` 收到 `stage:'brands'` 時觸發（n8n 工作流沒有定標題環節，維持本地做，失敗不擋流程）
- [x] `推薦文-3-完整生成`（wHUHCGjX2iyiY7wA）拿掉重複的「品牌媒體研究員」「真實用戶體驗研究員」＋對應 tavily 工具節點，改吃 App 傳進來的 `brandDetails`（新增「帶入品牌細節」節點依 brand_name 對應）；`定義輸入欄位1` 補收 `brandDetails` 欄位；Merge2 從 3 input 改 2 input；「官方資訊」規格那條分支不動；n8n_validate_workflow 確認 0 error

**2026-08-14：實測踩出一整批舊 bug＋成本優化＋架構拆兩段**（過程燒了不少錢跟時間，小積木不滿，逐項記錄避免重踩）

前端 bug：
- [x] `app/recommendation/page.tsx` 的 `parseOutlineText`/`serializeOutline` 原本用 markdown `## H2`/`### H3` 解析大綱，但 n8n `推薦文-2-大綱生成` 實際吐出來的是「前言/1./1.1./總結」編號純文字——完全解析不到，確認畫面大綱區塊永遠是空的，送出後工作流3 Switch 節點也吃不到內容。改成保留原始編號前綴直接編輯/送回，UI 標籤也從「H2/H3」改「大章/子項」

n8n `推薦文-1-品牌查詢`（vTmYbkLW6Vuge3UR）bug 修正：
- [x] 「帶入品牌細節」比對 brand_name 原本用完全字串比對，確認畫面手動編輯品牌名稱（哪怕只改一個字）就會讓深度研究資料整包對不到、靜默變空——改成正規化＋包含比對
- [x] 新增的 5 個 `Execute Workflow` 節點（媒體/UX搜尋A/B、網址搜尋）預設 `mode` 是「合併所有 item 只跑一次」，會導致多品牌時只有第一個品牌真的被搜尋到——全部明確設成 `mode: "each"`
- [x] 「找尋公司名稱」agent 沒有搜尋次數上限，曾經真的卡到 `Max iterations (10) reached`（不是理論風險，實測發生兩次）——`maxIterations` 從預設 10 降到 4，prompt 加「最多搜尋2次」；**曾經多加一句「不確定的寧可不輸出」結果矯枉過正，讓 AI 對明明存在的真實品牌也直接放棄輸出，已移除該句只留次數上限**
- [x] 「解析品牌清單」原本 0 品牌時會靜默回傳 0 items，下游「彙整品牌」收到 0 items 就完全不執行，callback 也不會發——job 卡在 researching 永遠不會變 failed，使用者只會看到一直轉圈。改成 0 筆時明確 throw，走現有失敗回報分支

n8n `推薦文-2-大綱生成`（xMK8p2scEcnEmkBa）bug 修正：
- [x] 「搜尋參考資料」agent 一樣沒有搜尋次數上限，同樣踩過 `Max iterations (10) reached`——`maxIterations` 設 6，prompt 加「最多搜尋4次，不足5筆就用現有結果」
- [x] 「回傳失敗狀態」節點在組錯誤訊息時自己也會噴錯（`Cannot read properties of undefined (reading 'message')`，實測發生過），等於錯誤回報機制本身有 bug——jsonBody 表達式改用 `?.` optional chaining，不會再炸

外部依賴問題（不是程式碼 bug，但今天測試失敗有一半是這個）：
- [x] Tavily API key 額度用完（`This request exceeds your plan's set usage limit`），造成所有 agent 的搜尋工具全部失敗、進而觸發上面那些 Max iterations——小積木換新 key，已更新到 n8n credential `Tavily account`（fxq8odhwbgS36kmi）

成本優化（推薦文-1 品牌查詢，用 agent+搜尋工具迴圈砍成固定搜尋+單次整理）：
- [x] 「品牌媒體研究員」「真實用戶體驗研究員」原本各自是 agent+2個搜尋工具（可能疊到6~7次模型呼叫/品牌），改成「2次固定搜尋（Execute Workflow 直接呼叫 tavily-進階搜尋）→ Merge → 1次一般 chainLlm 整理」，兩角色合計從最多12~14次模型呼叫砍到2次
- [x] 「找尋公司網址」同樣手法優化（原本1次搜尋的agent → 固定搜尋+chainLlm）

架構拆分（小積木提出：品牌研究跟大綱生成不該一次做完）：
- [x] 新建 n8n workflow `推薦文-1b-品牌深度研究`（id: 3DI3i7xxu0WNZkI1，webhook path `rec-step1b-branddetails`），把原本 `推薦文-1-品牌查詢` 裡「拆分品牌2」之後的深度研究整段搬過去獨立成一支
- [x] `推薦文-1-品牌查詢` 現在只做「找名稱/網址」，跑完就能給確認畫面，不用等深度研究
- [x] App 狀態機（`lib/recommendation-jobs.ts`）新增 `researching_details` 狀態；`applyStageResult` 就緒判斷拿掉 `brandDetails`（只要 brands+outline+titleSuggestions 到齊就進 `awaiting_confirm`，加了 guard 只在 `researching` 狀態才會轉換避免被後面階段的 callback 誤觸發）；新增 `confirmBrandsAndStartDetailResearch`
- [x] `app/api/recommendation/generate/route.ts` 改成先觸發 `rec-step1b-branddetails`（使用者確認/編輯後的品牌清單），不是直接生成
- [x] `app/api/recommendation/callback/route.ts` 收到 `stage:'brand_details'` 且狀態是 `researching_details` 時自動接著觸發 `rec-step3-generate`，使用者不用再按第二次
- [x] `app/recommendation/page.tsx` 加對應的「第三階段：品牌深度研究中」畫面
- 好處：確認畫面出現更快（不用等深度研究）；就算跑到一半撞到部署（見下方已知限制），最多只損失還沒跑完的那一階段

已知限制／殘留風險（沒完全解決，先記錄）：
- [x] （2026-08-17）**job 狀態存在記憶體，任何一次部署都會把進行中的任務直接砍掉**——`lib/recommendation-jobs.ts` 內部從 `Map` 改成 SQLite（`data/recommendation.db`，比照 `tkdDb.ts` 模式），對外函式簽章不變，其他呼叫端（route/callback/generate/status）都不用改。實測：寫入後用另一個獨立 process 讀同一筆 job 資料還在，確認部署重啟不會再把進行中任務砍掉
- [x] （2026-08-17）新建的 `推薦文-1b-品牌深度研究` 補上「回傳失敗狀態」節點（stage: `brand_details`），5 個真正會拋錯的節點（定義輸入欄位1／拆分品牌／品牌媒體研究員1／真實用戶體驗研究員1／彙整品牌細節）onError 改 `continueErrorOutput` 接過去，搜尋/整理節點原本的 `continueRegularOutput` 優雅降級不動；n8n_validate_workflow 0 error
- [ ] 確認畫面上方說明文字「填入主題與條件 → 確認品牌與大綱 → AI 生成推薦型文章」還是舊三步驟講法，沒更新成新的四步驟
- [ ] 「找尋公司名稱」偶爾還是會抓到不太相關的品牌（今天有一次抓到戰國策集團——後來確認他們真的有做短影音代操，不算真的抓錯，但提醒這塊資料品質本來就會有雜訊）
- [ ] **到收工為止，完整跑過一次「送出→確認→生成→WordPress草稿」全流程還沒有成功案例**，只驗證到「確認畫面能正常顯示品牌+大綱」這步；工作流3（完整生成）今天完全沒被測到
- 今天 OpenRouter 花費：$5.05（8/14 當日）

### 精選知識文章 `/knowledge`
瀏覽 AI 趨勢與 SEO 新知，資料存於 SQLite。

### 產品連結頁 `/products`
外部工具連結集合，手動維護於 `app/products/page.tsx`。

### Schema 檢查工具 `/schema-check`（2026-08-07，掛在 `/seo-check` hub）

已完成：
- 進工具先選「檢索」或「生成/補完」兩張卡片入口，之後可用分頁籤隨時切換
- **檢索模式**：改用網站健檢同一套 BFS 爬蟲（首頁 2 層連結＋sitemap 補爬，上限 25 頁）＋ GSC 有曝光的頁面兩路一起找候選頁，逐頁抓真實 JSON-LD（取代原本只挑「聯絡我們」候選頁的窄邏輯）
- 新增 `Organization` 型別辨識（純線上品牌如 91APP 站台常標這個，不是 LocalBusiness），關鍵欄位：Logo、聯絡方式（電話或 Email）、社群連結 (sameAs)
- 只顯示在地商家/組織品牌/商品/文章這幾種有意義的型別，WebPage/BreadcrumbList 這類頁面結構用的 schema 直接濾掉不顯示
- 同一份 schema 在多頁重複出現（常見於全站共用的 Organization）會去重只顯示一張卡片，卡片上註明出現在哪些頁面（超過 3 頁收合成清單）
- 欄位改用跟生成表單同一套「欄位對照表」逐項列出有值/未設定，不再是籠統的「缺：...」清單
- 修了 logo/image 常包成巢狀 `ImageObject`（WordPress Yoast SEO 常見）沒被正確讀出字串網址的 bug
- **生成/補完模式**：選型別（LocalBusiness/Organization）＋表單＋即時 JSON-LD 預覽/複製；可從檢索結果按「匯入到生成工具補完」把既有資料帶進表單當預設值
- 實測 stack.com.tw 驗證過：25 頁爬蟲抓到 10 篇文章的 Article schema，GSC 額外補到 15 個爬蟲沒碰到、但真的有曝光的文章網址

待辦／可以繼續的方向：
- [x] （2026-08-11）Product 型別補上「欄位對照表」跟生成表單（名稱/圖片/品牌/SKU/售價/幣別/庫存狀態/網址/簡介），可跟 LocalBusiness/Organization 一樣匯入補完
- [x] （2026-08-11）`image`/`logo` 欄位如果是 `{"@id":"..."}` 純參照（WordPress Yoast SEO 常見的 @graph 拆分節點寫法）已在 `lib/site-audit-crawler.ts` 的 `extractJsonLd` 解析回同一份 @graph 內對應的實際節點
- [x] （2026-08-11，拿 stack.com.tw 官網真實文章驗證）Article 節點原本共用 LocalBusiness/Organization 那套 `extractDisplayFields()`（只認 name/telephone 這類商家欄位），文章的 headline/author/datePublished/publisher 完全對不上，畫面誤顯示「沒有解析到可呈現欄位」。新增 `extractArticleFields()` 讀標題/作者/發布日期/修改日期/發布單位/圖片/關鍵字
- [x] （2026-08-11）檢索模式改成預設**只查首頁**（在地商家/組織品牌 schema 幾乎都是全站共用同一份，查首頁等於查全站），要深挖分散在各頁的 Product/Article 才勾「深度檢查」才跑原本的 25 頁爬蟲＋GSC 流程；`app/api/schema-check/route.ts` 加 `deep` 參數分流
- [x] （2026-08-11）查首頁改成固定用 jsdom 真的執行一次頁面 JS 再讀 DOM，抓得到 SHOPLINE 這類把商家 schema 用前端 JS 動態插入 DOM、伺服器端原始碼裡完全沒有的資料（拿 chaosmedusa.com 實測驗證：多了一份 `OnlineStore` 節點，含 telephone/sameAs/areaServed，純 fetch 完全看不到）。**中間繞了一圈重要教訓**：一開始直接在 API route 的 process 裡跑 jsdom（in-process），同一個網址測兩次結果不一樣——一次 6 秒跑完，一次卡超過 2 分鐘，連加的逾時保險絲（`setTimeout` 強制關 window）都攔不住。原因是客戶站第三方腳本（客服外掛/recaptcha）常用同步等待寫法呼叫外部伺服器，JS 單一執行緒卡住時連我們自己的計時器都排不進事件迴圈。改成獨立子行程執行（新增 `scripts/render-jsonld.cjs`，`lib/site-audit-crawler.ts` 的 `fetchRenderedHtml` 改用 `child_process.spawn` 呼叫、逾時送 `SIGKILL`），作業系統層級砍行程不用等卡住的那條線讓步，才是真正管用的解法；另外子行程裡也補了 `process.on('uncaughtException')` 吞掉客戶站腳本的未接例外（實測踩過 Google Maps 的 `performance.getEntriesByType` 在 jsdom 沒實作，會直接讓整個子行程崩潰）。代價：查首頁從原本近乎秒回變成固定約 10~15 秒（固定等 10 秒讓非同步注入的 schema 有機會跑完，實測用「數量穩定就提早結束」的輪詢會太早誤判提早結束漏抓）
- [x] （2026-08-11，拿 m2.com.tw 91APP 站實測）爬蟲＋sitemap 補頁對 91APP 這類純 CSR 平台原本幾乎抓不到東西（首頁原始 HTML 只有 7 個連結、3 個還連不上、sitemap.xml 標準路徑也不存在）。查證後發現 91APP 沒有 RSC 酬載可掃（不是 Next.js），真正關鍵是 sitemap 位置寫在 `robots.txt` 的 `Sitemap:` 這行（例：`/Sitemap/40644/Sitemap_Index.xml`）且是 gzip 壓縮，`lib/site-audit-crawler.ts` 的 `fetchSitemapUrls` 補上 robots.txt 探測＋gzip 解壓後，91APP 站從只抓到 1~2 頁變成能抓滿 25 頁；另外也加了 RSC 酬載掃描（給其他真的用 Next.js CSR 選單的平台，如 Shopline）與登入/購物車/會員等功能頁排除規則
- [x] （2026-08-11）91APP 的 sitemap 內有多個子 sitemap（分類/商品/文章…），原本深度檢查是照 sitemap 原始順序抓，m2.com.tw 實測分類頁（`ShopCategory`，97 條）排最前面會吃光 25 頁預算，抓不到真正有 schema 的商品頁（`ShopSalePage`）跟文章頁（`ShopInfoModuleArticle`）。`lib/site-audit-crawler.ts` 的 `fetchSitemapUrls` 新增 `sitemapPriority()`，依子 sitemap 檔名關鍵字（跟 `lib/tkd-platform.ts` 的 `ruleForSitemap`／`TYPE_ORDER` 同一招，改用通用關鍵字比對非只認 91APP 專屬檔名）排序：商品／文章優先、分類/標籤晚點抓、搜尋結果排最後，25 頁預算優先分給真正有機會帶 schema 的頁面
- [x] （2026-08-11）**深度檢查整個拿掉了**：小積木確認有意義的商家/組織 schema 幾乎都在首頁，25 頁全站爬蟲＋GSC 補抓那條路（`crawlSite`/`fetchPageSearchStats`）沒必要，`app/api/schema-check/route.ts` 整支重寫成只查首頁一頁，`app/schema-check/page.tsx` 拿掉「深度檢查」checkbox 跟 `onlyHomePage`/`gscChecked` 提示文字。（`crawlSite`/`sitemapPriority` 這些函式本身沒刪，`/site-audit` 全站健檢工具還在用）
- [x] （2026-08-11）**修了兩個讓 chaosmedusa.com 一直「時有時無」的真 bug**（拿真實案例來回測十幾次才抓到）：① `scripts/render-jsonld.cjs` 寫完 stdout 立刻 `process.exit(0)`，Node 官方文件明講 `exit()` 不等未完成的 I/O——手動在終端機跑會重導向到「檔案」（同步寫入，沒事），但 API 用 `child_process.spawn` 走的是「管道」（非同步，渲染後 HTML 常超過 1MB 超過管道緩衝區），資料每次都被腰斬在同樣位置，晚注入的 schema 就這樣消失，改成等 `write()` 的 callback 確認真的寫完再 exit；② SHOPLINE 常用的型別叫 `OnlineStore`（不是 `Organization`），沒在 `lib/site-audit-schema.ts` 的 `ORG_TYPES` 清單裡，抓到了也會被當雜項濾掉不顯示，補進清單
- [x] （2026-08-11）Organization/LocalBusiness 的 `logo` 欄位如果包成 ImageObject 物件（不是純字串網址），原本「列出有值欄位」那段只認純字串型別會整個跳過不顯示——明明缺欄位判斷邏輯知道「有 logo」，卻沒有對應欄位列給人看，兩邊邏輯對不起來，`extractDisplayFields()` 補上物件解析
- [ ] 上面這輪修完在小積木本機重啟 dev server 後，還沒完整用 UI 走一次確認 3 個 bug 修正都生效（尤其 `OnlineStore` 卡片正確顯示、不再是空的）
- [ ] 25 頁上限是拿 stack.com.tw 實測的保守值（50 頁要 77 秒，怕撞 Cloudflare 反代 100 秒逾時），之後確認過部署環境的逾時設定可以再視情況調整（現在只有 `/site-audit` 全站健檢會用到這個上限，schema-check 已經不爬多頁了）
- [ ] 還沒拿其他客戶網站（尤其是真的有實體門市的 LocalBusiness 案例）實測過，多測幾個站再確認欄位規則夠不夠用

---

## GSC 關鍵字排名 `/gsc`

### 已完成
- 客戶管理（新增、刪除、設定 Sheet）
- 關鍵字管理（標籤分群）
- 關鍵字排名查詢（本週 vs 上週，90 天滾動視窗）
- 寫入 Google Sheets（當周排名、上週排名欄）
- **文章排名查詢**（GSC 3 個月區間，以標題比對 Sheet「文章標題」欄）
- **自動更新**（每週一 09:00 cron，關鍵字排名 + 文章排名）
- GSC Google 授權集中在列表頁
- 便利貼（Apps Script 引用 ID、函式、公式 copy）
- 首頁卡片顯示追蹤關鍵字數、追蹤文章數、未設定 Sheet 紅字提示

### 環境變數
```
GOOGLE_SERVICE_ACCOUNT_JSON   GSC + Sheets 授權
CRON_SECRET                   cron 端點驗證
```

---

## AI 小編-社群海巡 LIFF `/liff/social-monitor`（正式版 2026-07-21）

幫客戶掃 Threads＋FB 社團近 14 天的熱門相關貼文，AI 逐篇評分關聯度並代擬建議留言。

- **Threads 爬蟲**：Apify `futurizerush/meta-threads-scraper-zh-tw`（支援 `search_filter` + `start_date=14 days`，做到「14 天內最熱門」）。舊 actor 切換備份見 `docs/social-monitor-actor-rollback.md`。
- **pick 頁**可選：關鍵字（最多 3）、怎麼挑貼文（讚/留言/關聯度）、最熱門 vs 最新。
- **結果頁**顯示 AI 關聯度徽章（60+ 綠／30-59 藍／30 以下灰），可按關聯度/讚/留言排序。
- **架構**：n8n 跑 5～10 分鐘超過 Node fetch 300s 上限，改 callback——App 送出即放手，n8n 跑完打 `/api/liff-social-monitor/callback` 寫回，前端輪詢。jobs 表在 `lib/socialMonitorJobs.ts`。
- n8n workflow：`AI小編-社群海巡-LIFF`（`8rjUoLUmShnsixhj`）。

## AI 小編 `/ai-editor`（開發中）

### 已完成
- 客戶資料庫（SQLite）
- 客戶列表頁（透過 LINE 機器人建立）
- `POST /api/ai-editor/register`：N8N 呼叫，依 line_uid upsert 客戶
- `GET /api/ai-editor/clients`：N8N 每日拉取客戶清單（含 site_url）

### N8N 串接流程
```
Step 1  用戶向 LINE 機器人輸入資料
        → N8N HTTP Request POST /api/ai-editor/register
        → body: { lineUid, name, siteUrl, socialAccount? }

Step 2  N8N 每日定時
        → HTTP Request GET /api/ai-editor/clients
        → 遍歷每個 client.site_url，轉 RSS（+ /feed/）偵測新文章
        → 有新文章 → N8N 內部啟動草稿生成流程
```

### 待完成
- N8N 草稿生成節點串接（Claude API）
- LINE 審核流程（N8N 回傳草稿 → 用戶確認 → 自動上架社群）
