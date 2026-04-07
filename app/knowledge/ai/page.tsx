export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getArticlesDb } from '@/lib/articlesDb';

type Article = { id: number; title: string; summary: string; sender: string; source_url: string; published_at: string; created_at: string };

export default function AIListPage() {
  const db = getArticlesDb();
  const articles = db.prepare(
    'SELECT id, title, summary, sender, source_url, published_at, created_at FROM articles WHERE category = ? ORDER BY created_at DESC'
  ).all('ai') as Article[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/knowledge" className="text-xs text-gray-400 hover:text-gray-600">← 返回</Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">🤖 AI 趨勢</h1>
            <p className="text-xs text-gray-400 mt-0.5">人工智慧最新發展與工具應用</p>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-24 text-gray-300 text-sm">尚無文章</div>
        ) : (
          <div className="flex flex-col gap-3">
            {articles.map(a => (
              <Link
                key={a.id}
                href={`/knowledge/ai/${a.id}`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-violet-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="font-semibold text-gray-900">{a.title}</div>
                  {a.sender && (
                    <span className="text-xs text-gray-400 shrink-0">{a.sender}</span>
                  )}
                </div>
                {a.summary && (
                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{a.summary}</p>
                )}
                <div className="mt-2 text-xs text-gray-300">
                  {a.published_at || a.created_at}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
