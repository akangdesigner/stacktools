"use client";

import Link from "next/link";

const categories = [
  {
    href: "/knowledge/ai",
    title: "AI 趨勢",
    description: "人工智慧最新發展、工具應用與產業動態。",
    icon: "🤖",
    color: "bg-violet-50 border-violet-200 hover:border-violet-400",
    iconBg: "bg-violet-100",
  },
  {
    href: "/knowledge/seo",
    title: "SEO 新知",
    description: "搜尋引擎最佳化技巧、演算法更新與實戰策略。",
    icon: "🔍",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
  },
];

export default function KnowledgePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 flex items-center justify-center px-6">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">精選知識文章</h1>
          <p className="text-gray-400 text-sm">選擇分類開始閱覽</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className={`block bg-white rounded-2xl border-2 p-10 transition-all hover:shadow-lg ${cat.color}`}
            >
              <div className={`w-14 h-14 rounded-2xl ${cat.iconBg} flex items-center justify-center text-3xl mb-6`}>
                {cat.icon}
              </div>
              <div className="font-semibold text-gray-900 text-base mb-2">{cat.title}</div>
              <div className="text-sm text-gray-400 leading-relaxed">{cat.description}</div>
            </Link>
          ))}
        </div>

        <div className="text-center">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← 返回工具箱
          </Link>
        </div>
      </div>
    </div>
  );
}
