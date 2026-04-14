import { NextRequest, NextResponse } from 'next/server';
import { getArticlesDb } from '@/lib/articlesDb';

// DELETE /api/articles/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getArticlesDb();
    const result = db.prepare('DELETE FROM articles WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: '找不到此文章' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
