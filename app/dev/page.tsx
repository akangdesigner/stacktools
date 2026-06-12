import Link from "next/link";

const sections = [
  {
    href: "/dev/meetings",
    title: "內部會議紀錄",
    description: "記錄技術部每次討論的主題、決議與待辦事項，讓團隊成員可以隨時回溯會議脈絡。",
    icon: "💬",
    color: "bg-slate-50 border-slate-200 hover:border-slate-400",
    iconBg: "bg-slate-100",
  },
  {
    href: "/dev/progress",
    title: "個人開發進度",
    description: "每位工程師登記目前進行中的任務、預計完成時間與阻礙，方便彼此掌握整體進度。",
    icon: "📋",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-100",
  },
];

export default function DevPage() {
  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">會議記錄與開發進度</h1>
        <p className="text-sm text-gray-500">技術部內部協作工具</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`relative block p-5 rounded-xl border-2 transition-all ${s.color}`}
          >
            <div className={`w-10 h-10 rounded-lg ${s.iconBg} flex items-center justify-center text-xl mb-3`}>
              {s.icon}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
