# Stacktools 開發進度

> 最後更新：2026-04-21

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

### 精選知識文章 `/knowledge`
瀏覽 AI 趨勢與 SEO 新知，資料存於 SQLite。

### 產品連結頁 `/products`
外部工具連結集合，手動維護於 `app/products/page.tsx`。

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
