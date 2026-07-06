import Link from "next/link";

// 網站健檢工具 hub：把 TKD 與網站技術健檢兩個工具收在同一入口，點進來再選。
const tools = [
  {
    href: "/tkd",
    title: "TKD 現況產生器",
    description:
      "輸入客戶網址與登記表網址，自動爬每一頁的現有 title / description / keywords / H1，依格式寫回 Google 登記表。",
    icon: "🏷️",
    color: "bg-lime-50 border-lime-200 hover:border-lime-400",
    iconBg: "bg-lime-100",
  },
  {
    href: "/site-audit",
    title: "網站技術健檢",
    description:
      "輸入一個網址，自動辨識 TKD、H 標籤、圖片 ALT、結構化數據、E-E-A-T、站台檔案等技術指標，標出正常 / 可優化 / 需處理。",
    icon: "🔍",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
  },
];

export default function SeoCheckHubPage() {
  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">網站健檢工具</h1>
        <p className="text-sm text-gray-500 mt-1">選擇要使用的工具。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`relative block p-5 rounded-xl border-2 transition-all ${tool.color}`}
          >
            <div
              className={`w-10 h-10 rounded-lg ${tool.iconBg} flex items-center justify-center text-xl mb-3`}
            >
              {tool.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{tool.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
