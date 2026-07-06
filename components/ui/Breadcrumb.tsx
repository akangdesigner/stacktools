'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PATH_LABELS: Record<string, string> = {
  '/writer':                '寫手流程工具',
  '/article':               '文章上架工具',
  '/knowledge':             '精選知識文章',
  '/recommendation':        '推薦文生成器',
  '/gsc':                   'GSC 排名查詢',
  '/social':                '社群貼文追蹤',
  '/blog-gen':              '部落格文章生成',
  '/ai-editor':             'AI 小編生成文章',
  '/ai-editor/setup-guide': '設定指南',
  '/ig':                    'IG 監控報告',
  '/finance':               '財務發票管理',
  '/finance/clients':       '客戶列表',
  '/finance/new':           '新增發票',
  '/subscription':          '訂閱費用監控',
  '/monthly-plan':          '客戶進度追蹤',
  '/dev':                   '技術部開發日程安排',
  '/dev/meetings':          '內部會議紀錄',
  '/dev/meetings/new':      '新增會議',
  '/dev/progress':          '開發日程安排',
  '/dev/progress/assign':   '任務分配',
  '/page-tracker':          '網頁改動追蹤',
  '/page-tracker/all':      '全部追蹤',
  '/products':              '產品連結',
};

function getLabel(fullPath: string, seg: string): string {
  if (PATH_LABELS[fullPath]) return PATH_LABELS[fullPath];
  if (/^\d+$/.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg)) return '詳情';
  return seg;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const fullPath = '/' + segments.slice(0, i + 1).join('/');
    return { href: fullPath, label: getLabel(fullPath, seg) };
  });

  return (
    <nav className="flex items-center gap-1 px-8 py-2.5 border-b border-gray-100 bg-white text-sm text-gray-400 flex-wrap">
      <Link href="/" className="hover:text-gray-700 transition-colors">
        首頁
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <span className="text-gray-200">/</span>
          {i === crumbs.length - 1 ? (
            <span className="text-gray-700 font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
