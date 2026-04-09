import { NextRequest, NextResponse } from 'next/server';
import { getArticlesDb } from '@/lib/articlesDb';

// GET /api/articles?category=ai
export async function GET(req: NextRequest) {
  try {
    const db = getArticlesDb();
    const category = req.nextUrl.searchParams.get('category');

    const rows = category
      ? db.prepare('SELECT id, category, title, summary, sender, source_url, published_at, created_at FROM articles WHERE category = ? ORDER BY created_at DESC').all(category)
      : db.prepare('SELECT id, category, title, summary, sender, source_url, published_at, created_at FROM articles ORDER BY created_at DESC').all();

    return NextResponse.json({ articles: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/articles
// n8n 送來的格式：{ category, title, content, summary?, sender?, source_url?, published_at? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, title, content, summary, sender, source_url, published_at } = body;

    if (!category || !title || !content) {
      return NextResponse.json({ error: '缺少必要欄位：category、title、content' }, { status: 400 });
    }

    if (!['ai', 'seo'].includes(category)) {
      return NextResponse.json({ error: 'category 只接受 "ai" 或 "seo"' }, { status: 400 });
    }

    const db = getArticlesDb();
    const result = db.prepare(
      'INSERT OR IGNORE INTO articles (category, title, content, summary, sender, source_url, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(category, title, content, summary ?? null, sender ?? null, source_url ?? null, published_at ?? null);

    if (result.changes === 0) {
      return NextResponse.json({ success: false, duplicate: true, message: '文章已存在（source_url 重複）' });
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
