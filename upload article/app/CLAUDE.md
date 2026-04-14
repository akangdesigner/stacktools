@AGENTS.md

# 專案目標

這是一個給**非技術人員**使用的文章上架工具，目標是把原本需要手動執行 JS + Python 的流程，包裝成一個簡單易用的四步驟網頁介面。

## 核心功能
1. 提供 Console JS 片段，讓使用者在草稿文章網站取得格式化 HTML
2. 貼入 HTML 後，依據客戶設定（顏色、字型大小等）自動清洗樣式
3. 支援多客戶設定管理，設定儲存於 localStorage
4. 輸出清洗後 HTML，方便複製貼入 Shopline 等 CMS

## 設計原則
- 介面全程繁體中文，操作步驟清晰，不懂代碼也能使用
- 每個步驟只有一個主要動作
- 客戶樣式設定可重複使用，不需每次重新輸入

## 技術架構
- **框架**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **HTML 清洗**: `/api/clean-html` Route Handler（server-side，使用 `node-html-parser`）
- **資料儲存**: localStorage（key: `article-processor:clients`）
- **專案根目錄**: `C:\upload article\app\`

## 相關文件
- `PROCESS.md` — 操作流程說明（給使用者參考）
