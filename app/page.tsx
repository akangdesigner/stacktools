import Link from "next/link";

const tools = [
  {
    href: "/article",
    title: "文章上架工具",
    description: "四步驟精靈，自動清洗並格式化文章 HTML，依客戶樣式設定套用標題、段落、連結、圖片樣式。",
    icon: "📝",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-100",
  },
  {
    href: "/ig",
    title: "IG 監控報告",
    description: "查看追蹤帳號的近期貼文成效，包含文章內容、愛心數、精選留言與 AI 摘要分析。",
    icon: "📸",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400",
    iconBg: "bg-purple-100",
  },
  {
    href: "/knowledge",
    title: "精選知識文章",
    description: "瀏覽 AI 趨勢與 SEO 新知，掌握最新產業動態與實用知識。",
    icon: "📚",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
  },
  {
    href: "/recommendation",
    title: "推薦文生成器",
    description: "填入被推薦人資訊與事蹟，AI 自動生成一封正式、有說服力的推薦文。",
    icon: "✉️",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
    iconBg: "bg-orange-100",
  },
];

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">工具箱</h1>
        <p className="text-gray-500 mt-1">選擇工具開始作業</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`block p-5 rounded-xl border-2 transition-all ${tool.color}`}
          >
            <div className={`w-10 h-10 rounded-lg ${tool.iconBg} flex items-center justify-center text-xl mb-3`}>
              {tool.icon}
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">{tool.title}</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
