import { getMeeting } from '@/lib/meetingsDb';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import DeleteMeetingButton from './DeleteMeetingButton';

export const dynamic = 'force-dynamic';

const AVATAR_COLOR: Record<string, string> = {
  nana:   'bg-rose-100 text-rose-600',
  todd:   'bg-sky-100 text-sky-600',
  steven: 'bg-violet-100 text-violet-600',
  emma:   'bg-amber-100 text-amber-600',
};

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = getMeeting(Number(id));
  if (!meeting) notFound();

  return (
    <div className="p-8 max-w-3xl">
      {/* 頂部操作列 */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/dev/meetings" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          ← 返回列表
        </Link>
        <DeleteMeetingButton id={meeting.id} />
      </div>

      {/* 文件主體 */}
      <div className="bg-white rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* 頂部藍條 */}
        <div className="h-1.5 bg-gradient-to-r from-blue-600 to-blue-400" />

        <div className="p-8">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold leading-none">W</span>
            </div>
            <span className="text-sm text-gray-400">{meeting.date}</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-5">{meeting.title}</h1>

          {/* 出席人員 */}
          {meeting.attendees.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">出席人員</p>
              <div className="flex gap-1.5 flex-wrap">
                {meeting.attendees.map(name => (
                  <span
                    key={name}
                    className={`text-xs font-medium px-2 py-1 rounded-lg ${AVATAR_COLOR[name] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 分隔線 */}
          <hr className="border-gray-100 mb-6" />

          {/* 會議內容 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">會議內容</p>
            {meeting.content ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{meeting.content}</p>
            ) : (
              <p className="text-sm text-gray-300">無內容記錄</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
