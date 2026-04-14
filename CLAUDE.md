# 專案說明

## 使用者
- 名稱：小積木
- 語言：請全程使用**繁體中文**與小積木對話

## 行為準則
- 所有回覆、說明、註解一律使用繁體中文
- 稱呼使用者為「小積木」
- **不要主動 git push**，只有小積木說「推」才執行

## 修改限制
- 每次只修改一個功能或一個檔案，不要在同一次回覆中大量改動多個檔案
- 若預計需要修改超過 3 個檔案，**必須先暫停**，向小積木說明打算做什麼、會動到哪些檔案、預計影響範圍，等確認後才動手

---

## 技術架構

- **框架**：Next.js 16（App Router）+ TypeScript + Tailwind CSS v4
- **部署**：Zeabur（`zbpack.json` 設定，Node 24，port 3001）
- **資料庫**：better-sqlite3（本機 SQLite）
- **AI**：`@anthropic-ai/sdk`
- **HTML 解析**：`node-html-parser`
- **專案根目錄**：`C:\stacktools\app\`
- **本機啟動**：`npm run dev`（port 3001）

---

## 功能模組

### 1. 文章上架工具（`/article`）
四步驟精靈，把草稿文章 HTML 清洗成符合客戶樣式的上架版本。

| 步驟 | 元件 | 說明 |
|------|------|------|
| Step 1 | `Step1GetSnippet.tsx` | 產生 Console JS 片段，讓使用者從草稿站取得 HTML |
| Step 2 | `Step2PasteHtml.tsx` | 貼入 HTML |
| Step 3 | `Step3ImageReplace.tsx` | 替換圖片網址（自動跳過 emoji img） |
| Step 3 | `Step3SelectClient.tsx` | 選擇客戶設定 |
| Step 4 | `Step4CopyResult.tsx` | 輸出清洗後 HTML |

**核心邏輯**
- `lib/html-cleaner.ts`：Server-side HTML 清洗（標題、段落、連結、圖片樣式、TOC 產生、emoji img 保留 1em 尺寸）
- `lib/snippet-generator.ts`：產生 Step 1 的 JS 片段
- `lib/client-defaults.ts`：客戶預設值
- `app/api/clean-html/route.ts`：清洗 API
- `hooks/useWizard.ts`：精靈狀態管理
- `hooks/useClients.ts`：客戶設定（存於 localStorage，key: `article-processor:clients`）

### 2. IG 監控報告（`/ig`）
查看追蹤帳號近期貼文成效（愛心、留言、觀看數、AI 摘要）。
- `lib/monitoring-api.js`、`lib/monitoring-mockdata.js`
- `app/api/ig-report/`、`app/api/ig-avatars/`、`app/api/ig-tracklist/`、`app/api/ig-track/`、`app/api/ig-n8n-trigger/`

### 3. 推薦文生成器（`/recommendation`）
輸入標題、關鍵字、品牌等，呼叫 Claude API 產生推薦文章。
- `lib/recommendation-jobs.ts`
- `app/api/recommendation/`（含 callback、status 子路由）

### 4. 精選知識文章（`/knowledge`）
瀏覽 AI 趨勢與 SEO 新知。
- `lib/articlesDb.ts`：SQLite 文章資料庫

### 5. 產品連結頁（`/products`）
外部工具連結集合，手動維護清單於 `app/products/page.tsx`。

---

## 常用路徑速查

```
app/
  article/page.tsx          文章上架工具頁面
  ig/page.tsx               IG 監控頁面
  recommendation/page.tsx   推薦文生成器頁面
  products/page.tsx         產品連結頁（手動新增連結在此）
  api/clean-html/route.ts   HTML 清洗 API
components/
  wizard/                   文章精靈各步驟元件
  client-manager/           客戶設定管理（新增/編輯/刪除）
  ui/                       共用 UI 元件（CopyButton、HtmlPreview 等）
lib/
  html-cleaner.ts           HTML 清洗核心邏輯
  snippet-generator.ts      Step 1 JS 片段產生
  client-defaults.ts        客戶欄位預設值
hooks/
  useWizard.ts              精靈狀態
  useClients.ts             客戶設定讀寫（localStorage）
```
