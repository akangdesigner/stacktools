export const dynamic = 'force-dynamic';

import { getArticlesDb } from '@/lib/articlesDb';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function AIArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getArticlesDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ? AND category = ?').get(id, 'ai') as any;
  if (!article) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/knowledge/ai" className="text-xs text-gray-400 hover:text-gray-600 mb-6 inline-block">← 返回 AI 趨勢</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{article.title}</h1>
        <div className="flex gap-3 text-xs text-gray-400 mb-8">
          {article.published_at && <span>{article.published_at}</span>}
          {article.source_url && <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">原始來源 ↗</a>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: article.content }} />
      </div>
    </div>
  );
}
