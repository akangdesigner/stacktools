export const dynamic = 'force-dynamic';

import { getArticlesDb } from '@/lib/articlesDb';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ArticleBody from '../../_components/ArticleBody';

export default async function SEOArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getArticlesDb();
  const article = db.prepare('SELECT * FROM articles WHERE id = ? AND category = ?').get(id, 'seo') as any;
  if (!article) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/knowledge/seo" className="text-xs text-gray-400 hover:text-gray-600 mb-6 inline-block">← 返回 SEO 新知</Link>
        <ArticleBody
          title={article.title}
          content={article.content}
          publishedAt={article.published_at}
          sourceUrl={article.source_url}
        />
      </div>
    </div>
  );
}
