import Link from 'next/link';

const tools = [
  {
    href: '/article',
    icon: '📝',
    title: '文章上架工具',
    intro: '將草稿文章的 HTML 清洗成符合客戶樣式的上架版本，支援多種客戶設定，四步驟精靈引導完成。',
    steps: [
      '點擊「取得程式碼」，將產生的 JS 片段貼入草稿站瀏覽器 Console 執行，複製取得的 HTML。',
      '切換到「貼入 HTML」，將剛才複製的原始 HTML 貼入欄位。',
      '在「選擇客戶」中選取目標客戶設定（樣式、連結前綴、圖片尺寸等）；若需替換圖片網址，在「圖片替換」頁面完成。',
      '切換到「複製結果」，取得清洗完成的 HTML，直接貼入客戶後台上架。',
    ],
  },
  {
    href: '/ig',
    icon: '📸',
    title: 'IG 監控報告',
    intro: '追蹤指定 IG 帳號的近期貼文成效，包含愛心數、留言數、觀看數與精選留言，支援手動或定時抓取。',
    steps: [
      '在「新增追蹤帳號」輸入 IG 帳號網址與顯示名稱，按「確認追蹤」加入清單。',
      '設定「發佈日期在此之後」篩選條件，點「重新抓取貼文」觸發 n8n 同步（約 1 分鐘）。',
      '同步完成後自動載入，或手動按「產生報告」查看結果。',
      '可依帳號篩選、依愛心數／留言數／觀看數排序，快速找到高互動貼文。',
    ],
  },
  {
    href: '/knowledge',
    icon: '📚',
    title: '精選知識文章',
    intro: '瀏覽 AI 趨勢與 SEO 新知，由系統定期更新，掌握產業動態。',
    steps: [
      '直接進入頁面即可瀏覽所有精選文章。',
      '點擊文章卡片可展開全文或跳轉原始連結。',
    ],
  },
  {
    href: '/recommendation',
    icon: '✉️',
    title: '推薦文生成器',
    intro: '填入被推薦人的基本資料與事蹟，AI 自動生成一封正式、有說服力的推薦函。',
    steps: [
      '填寫被推薦人姓名、職位、推薦人身份與具體事蹟。',
      '選擇推薦文風格（正式／親切），按「生成推薦文」。',
      '等待 AI 生成完畢後，直接複製使用或微調後再複製。',
    ],
  },
  {
    href: '/gsc',
    icon: '🔍',
    title: 'GSC 排名查詢',
    intro: '管理各客戶的追蹤關鍵字與文章，查詢本週與上週的 Google 搜尋排名變化，並自動寫入 Google Sheets。每週一 10:00 自動更新。',
    steps: [
      '進入「GSC 排名查詢」，點「新增客戶」填入名稱與 GSC 站台網址。',
      '進入客戶頁面，設定關鍵字 Sheet（填入 Google Sheets 網址與分頁名稱）。',
      '貼入追蹤關鍵字（每行一個），按「儲存」。',
      '設定文章 Sheet，貼入文章標題與網址（每行「標題 Tab 網址」格式），按「儲存」。',
      '按「查詢排名」查看本週與上週對比；按「寫入 Sheet」將結果寫入 Google Sheets。',
      '開啟「自動更新」後，每週一 10:00 自動查詢並寫入 Sheet。',
    ],
  },
  {
    href: '/social',
    icon: '📊',
    title: '社群貼文追蹤',
    badge: '開發中',
    intro: '統一管理各客戶的 FB／IG／YT／TikTok／Threads 帳號，定期抓取最新貼文並通知 Slack。',
    steps: [
      '進入「社群監控客戶」，點「新增客戶」建立客戶資料，填入名稱與 Slack 頻道 ID。',
      '進入客戶頁面，展開「各平台帳號網址」，填入各平台的帳號網址後按「儲存網址」。',
      '按「抓取社群內容」觸發 n8n 抓取（約 3 分鐘），完成後報告自動更新。',
      '在報告區可依平台、帳號擁有者、日期區間篩選貼文，快速比較各平台成效。',
      '開啟「自動監控」後，系統會依排程定時抓取並推送通知。',
    ],
  },
];

const externalProducts = [
  {
    href: '/ai-editor',
    icon: '✍️',
    title: 'AI 小編生成文章',
    badge: '開發中',
    intro: '自動偵測官網最新文章，由 AI 產生社群圖文草稿，透過 LINE 傳給業主審核，確認後自動上架至各社群帳號。',
    steps: [
      '在設定頁填入官網網址、社群帳號權限與業主 LINE UID。',
      '系統定期掃描官網，偵測到新文章後自動產生 AI 圖文草稿。',
      '草稿透過 LINE 傳給業主預覽，業主點選「核准」或「重生」。',
      '核准後系統自動上架至設定的社群帳號。',
    ],
  },
  {
    href: '/products',
    icon: '📦',
    title: '外部產品',
    intro: '集合 Stacktools 對外提供的產品與服務連結，方便快速存取。',
    steps: [
      '進入頁面後點擊對應產品連結，即可前往外部服務。',
    ],
  },
];

function ToolSection({ tool }: { tool: typeof tools[number] & { badge?: string } }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{tool.icon}</span>
        <Link href={tool.href} className="text-base font-semibold text-gray-900 hover:underline">{tool.title}</Link>
        {tool.badge && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{tool.badge}</span>
        )}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed">{tool.intro}</p>
      <ol className="space-y-1.5 pl-1">
        {tool.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-gray-700">
            <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ManualPage() {
  return (
    <div className="p-8 max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">使用手冊</h1>
        <p className="mt-1 text-sm text-gray-500">所有工具的使用說明與外部產品介紹，有問題歡迎透過首頁回饋按鈕告知。</p>
      </div>

      {/* 內部工具 */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">內部工具</h2>
        {tools.map((tool) => <ToolSection key={tool.href} tool={tool} />)}
      </div>

      {/* 外部產品 */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">外部產品</h2>
        {externalProducts.map((tool) => <ToolSection key={tool.href} tool={tool} />)}
      </div>
    </div>
  );
}
