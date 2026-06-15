import { getMeetings } from '@/lib/meetingsDb';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const AVATAR_COLOR: Record<string, string> = {
  nana:   'bg-rose-100 text-rose-600',
  todd:   'bg-sky-100 text-sky-600',
  steven: 'bg-violet-100 text-violet-600',
  emma:   'bg-amber-100 text-amber-600',
};

export default function MeetingsPage() {
  const meetings = getMeetings();

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">內部會議記錄</h1>
          <p className="text-sm text-gray-400">每次會議獨立一份文件</p>
        </div>
        <Link href="/dev/meetings/new" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
          <span className="text-base leading-none">＋</span> 新增會議
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-24 text-gray-300">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-sm">尚無會議記錄，點右上角新增第一筆</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {meetings.map(m => (
            <Link
              key={m.id}
              href={`/dev/meetings/${m.id}`}
              className="group block relative bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.13)] transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
            >
              {/* 折角 */}
              <div className="absolute top-0 right-0 w-0 h-0 border-t-[28px] border-r-[28px] border-t-transparent border-r-gray-100 z-10" />
              <div className="absolute top-0 right-0 w-0 h-0 border-t-[26px] border-r-[26px] border-t-white border-r-transparent z-20" />

              {/* 頂部藍條 */}
              <div className="h-1.5 bg-gradient-to-r from-blue-600 to-blue-400" />

              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold leading-none">W</span>
                  </div>
                  <span className="text-xs text-gray-400">{m.date}</span>
                </div>

                <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-3 group-hover:text-blue-700 transition-colors">
                  {m.title}
                </h3>

                {m.content && (
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-4">
                    {m.content}
                  </p>
                )}

                {m.attendees.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {m.attendees.map(name => (
                      <span
                        key={name}
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${AVATAR_COLOR[name] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
