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
  '/seo-check':             '網站健檢工具',
  '/tkd':                   'TKD 現況產生器',
  '/site-audit':            '網站技術健檢',
};

// 概念上的上層（網址是扁平的，但工具掛在某個 hub 底下）：
// TKD 產生器與網站技術健檢都收在「網站健檢工具」(/seo-check) 之下
const PATH_PARENTS: Record<string, string> = {
  '/tkd':        '/seo-check',
  '/site-audit': '/seo-check',
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

  // 扁平網址的工具補上概念上的 hub 上層（如 /tkd → 先插入 網站健檢工具）
  const parent = crumbs.length > 0 ? PATH_PARENTS[crumbs[0].href] : undefined;
  if (parent) {
    crumbs.unshift({ href: parent, label: getLabel(parent, parent.slice(1)) });
  }

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
