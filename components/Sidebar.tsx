'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const homeItem = {
  href: '/',
  label: '首頁',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
};

const liveItems: { href: string; label: string; inDev?: boolean; suspended?: boolean; icon: React.ReactNode }[] = [
  {
    href: '/article',
    label: '文章上架工具',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/ig',
    label: 'IG 監控報告',
    suspended: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '/knowledge',
    label: '精選知識文章',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    href: '/recommendation',
    label: '推薦文生成器',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/gsc',
    label: 'GSC 排名查詢',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    href: '/social',
    label: '社群貼文追蹤',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

const extraItems = [
  {
    href: '/ai-editor',
    label: 'AI 小編生成文章',
    inDev: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: '外部產品',
    inDev: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showSuspended, setShowSuspended] = useState(false);

  return (
    <>
    {showSuspended && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => setShowSuspended(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl px-8 py-7 max-w-sm w-full mx-4 text-center"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-3xl mb-3">⏸</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">暫時下架</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-5">此功能目前暫時下架，如有需要請聯絡管理員。</p>
          <button
            onClick={() => setShowSuspended(false)}
            className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    )}
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-screen">
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-3 border-b border-gray-200">
        <Image src="/stack_ai_logo.png" alt="Stacktools" width={100} height={100} className="w-auto h-14 object-contain" />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-4 overflow-y-auto">
        {/* 首頁 */}
        {(() => {
          const isActive = pathname === '/';
          return (
            <Link href={homeItem.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              {homeItem.icon}{homeItem.label}
            </Link>
          );
        })()}

        {/* 內部工具 */}
        <div>
          <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">內部工具</p>
          <div className="space-y-1">
            {liveItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              if (item.suspended) {
                return (
                  <button key={item.href} onClick={() => setShowSuspended(true)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900 w-full text-left">
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-gray-400 font-normal">暫時下架</span>
                  </button>
                );
              }
              return (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.inDev && !isActive && <span className="text-xs text-amber-500 font-normal">開發中</span>}
                </Link>
              );
            })}
          </div>
        </div>

        {/* 外部產品 */}
        <div>
          <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">外部產品</p>
          <div className="space-y-1">
            {extraItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.inDev && !isActive && <span className="text-xs text-amber-500 font-normal">開發中</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

{/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2">
        {session?.user && (
          <div className="flex items-center gap-2">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? ""}
                width={28}
                height={28}
                className="rounded-full shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <span className="text-xs text-gray-500">{session.user.name?.[0] ?? "?"}</span>
              </div>
            )}
            <span className="text-xs text-gray-600 truncate flex-1">{session.user.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              title="登出"
            >
              登出
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400">Stacktools v1.0</p>
      </div>
    </aside>
    </>
  );
}
