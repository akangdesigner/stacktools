# Stacktools 開發進度

> 最後更新：2026-08-07

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

待辦項目：
- [ ] 確認「定標題」在第一階段要怎麼運作（AI 依調查結果建議標題給使用者確認？還是保留使用者輸入、AI 只是優化潤飾？）
- [ ] 把第一階段改回／改成正式接三支 n8n 工作流其中的「品牌查詢」，或者維持本地執行但補上定標題邏輯
- [ ] 拿掉 `推薦文-3-完整生成` 內部重複的品牌媒體/UX 研究，改吃前面階段已查好的資料
- [ ] 決定 `推薦文資料查詢claude版` 舊工作流去留

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
- [ ] Product 型別目前沒有像 LocalBusiness/Organization 一樣的「欄位對照表」跟生成表單，只有原本的 missing 檢查
- [ ] `image` 欄位如果是 `{"@id":"..."}` 純參照（沒有實際 url，需要跨節點解析 `@graph`）目前還是顯示「未設定」，沒做這層解析
- [ ] 25 頁上限是拿 stack.com.tw 實測的保守值（50 頁要 77 秒，怕撞 Cloudflare 反代 100 秒逾時），之後確認過部署環境的逾時設定可以再視情況調整
- [ ] 還沒拿其他客戶網站（尤其是真的有實體門市的 LocalBusiness 案例、非 91APP 平台）實測過，多測幾個站再確認欄位規則夠不夠用

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
