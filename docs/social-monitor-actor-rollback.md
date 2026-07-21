# 社群海巡 Threads Actor 切換備份

n8n workflow：**AI小編-社群海巡-LIFF**（`8rjUoLUmShnsixhj`）

2026-07-21 把 Threads 爬蟲從 `watcher.data` 換成 `futurizerush`，原因是舊 actor **沒有日期參數**，
只能「最相關（歷年最熱）」或「最新」二選一：

- 選最相關 → 撈回來全是 2025 年爆文，14 天窗擋掉 76%，冷門關鍵字（如「私密處保養」）**20 筆全滅、歸零**
- 選最新 → 資料新但前段是關聯度 5 分的閒聊文，品質差

新 actor 支援 `search_filter=top` + `start_date=14 days`，即「14 天內最熱門」，一次解決；
單價也從 $0.008/筆 降到 $0.0025/筆。

**新 actor 評分 3.26，比舊的 4.74 低**，若實測資料品質不佳，照下面原樣貼回即可。

---

## 舊版設定（回退用，原樣照貼）

### 節點：`Threads`（id: `threads-scrape`）

- type: `@apify/n8n-nodes-apify.apify`，typeVersion 1
- credentials: apifyApi id `s12L9x0lhlACez7l`（name: seo）
- executeOnce: `false`（關掉才能讓多個關鍵字都跑）

```
operation: Run actor and get dataset
actorId:
  __rl: true
  value: D15iJFBNZ9wgeWAhw
  mode: list
  cachedResultName: Search Threads By Keywords (watcher.data/search-threads-by-keywords)
  cachedResultUrl: https://console.apify.com/actors/D15iJFBNZ9wgeWAhw/input
```

customBody（expression，開頭的 `=` 要保留）：

```
={
    "keywords": [
        "{{ $json.keyword }}"
    ],
    "proxyConfiguration": {
        "useApifyProxy": false
    },
    "sortByRecent": {{ $('When Executed by Another Workflow').first().json.customer_data.freshness === 'recent' }},
    "maxItemsPerKeyword": 20
}
```

舊 actor 輸出欄位：`text` / `url` / `created_at`（**Unix 秒數**）/ `like_count` / `reply_count`

### 節點：`Edit Fields2`（id: `edit-fields2-t`）

| 欄位 | 值 | 型別 |
|---|---|---|
| 文章內容 | `={{ $json.text }}` | string |
| 網址 | `={{ $json.url }}` | string |
| 發佈時間 | 見下方 | string |
| 愛心數 | `={{ $json.like_count }}` | string |
| 留言數 | `={{ $json.reply_count }}` | number |

發佈時間（舊版，注意 `* 1000` 是因為 `created_at` 是 Unix 秒數）：

```
={{
new Date($json.created_at * 1000)
.toLocaleDateString(
'zh-TW',
{
timeZone:'Asia/Taipei',
year:'numeric',
month:'2-digit',
day:'2-digit'
}
)
.replace(/\//g,'-')
}}
```

---

## 新版設定（2026-07-21 起）

actor：`futurizerush/meta-threads-scraper-zh-tw`（`boM8VQ2kWWXeqAv4M`）

```
mode: "search"          必填，其他值：user（用戶貼文）/ profiles（找帳號）
keywords: ["關鍵字"]
max_posts: 50           上限 10000
search_filter: top      熱門 / recent 最新（接前端的新鮮度選項）
start_date: "14 days"   支援相對時間或 YYYY-MM-DD；只有 search 模式能用
```

新 actor 輸出欄位：`text_content` / `post_url` / `created_at`（**ISO 字串，不能再 `* 1000`**）/ `like_count` / `reply_count`

「排除重複」節點的 14 天過濾**保留**，當 actor 沒照做時的保險。
