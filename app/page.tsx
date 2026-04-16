import Link from "next/link";

const internalTools = [
  {
    href: "/article",
    title: "文章上架工具",
    description: "四步驟精靈，自動清洗並格式化文章 HTML，依客戶樣式設定套用標題、段落、連結、圖片樣式。",
    icon: "📝",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-100",
    inDev: false,
  },
  {
    href: "/ig",
    title: "IG 監控報告",
    description: "查看追蹤帳號的近期貼文成效，包含文章內容、愛心數、精選留言與 AI 摘要分析。",
    icon: "📸",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400",
    iconBg: "bg-purple-100",
    inDev: false,
  },
  {
    href: "/knowledge",
    title: "精選知識文章",
    description: "瀏覽 AI 趨勢與 SEO 新知，掌握最新產業動態與實用知識。",
    icon: "📚",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
    inDev: false,
  },
  {
    href: "/recommendation",
    title: "推薦文生成器",
    description: "填入被推薦人資訊與事蹟，AI 自動生成一封正式、有說服力的推薦文。",
    icon: "✉️",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
    iconBg: "bg-orange-100",
    inDev: false,
  },
  {
    href: "/social",
    title: "社群貼文追蹤",
    description: "設定客戶的社群帳號網址，定期抓取 FB/IG/YT/TikTok/Threads 的最新貼文，並發送通知到 Slack。",
    icon: "📊",
    color: "bg-rose-50 border-rose-200 hover:border-rose-400",
    iconBg: "bg-rose-100",
    inDev: true,
  },
];

const externalTools = [
  {
    href: "/ai-editor",
    title: "AI 小編生成文章",
    description: "偵測官網新文章，自動產生 AI 圖文草稿，傳至 LINE 讓業主審核，確認後自動上架社群帳號。",
    icon: "✍️",
    color: "bg-violet-50 border-violet-200 hover:border-violet-400",
    iconBg: "bg-violet-100",
    inDev: true,
  },
  {
    href: "/products",
    title: "外部產品",
    description: "瀏覽對外提供的產品與服務連結。",
    icon: "📦",
    color: "bg-gray-50 border-gray-200 hover:border-gray-400",
    iconBg: "bg-gray-100",
    inDev: false,
  },
];

export default function HomePage() {
  return (
    <>
    <div className="p-8 space-y-10 max-w-2xl">
      {/* 內部工具 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">內部工具</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {internalTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`relative block p-5 rounded-xl border-2 transition-all ${tool.color}`}
            >
              {tool.inDev && (
                <span className="absolute top-3 right-3 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">開發中</span>
              )}
              <div className={`w-10 h-10 rounded-lg ${tool.iconBg} flex items-center justify-center text-xl mb-3`}>
                {tool.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{tool.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* 外部產品 */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">外部產品</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {externalTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`relative block p-5 rounded-xl border-2 transition-all ${tool.color}`}
            >
              {tool.inDev && (
                <span className="absolute top-3 right-3 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">開發中</span>
              )}
              <div className={`w-10 h-10 rounded-lg ${tool.iconBg} flex items-center justify-center text-xl mb-3`}>
                {tool.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{tool.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>

    </div>
    <Link
      href="/feedback"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-2xl shadow-lg hover:bg-gray-700 transition-colors"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 16a2 2 0 01-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
      </svg>
      工具箱回饋
    </Link>
    </>
  );
}
