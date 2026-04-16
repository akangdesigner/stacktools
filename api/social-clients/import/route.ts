import { NextRequest, NextResponse } from 'next/server';
import { createClient, setClientUrls } from '@/lib/socialDb';

interface ImportEntry {
  name?: string;
  slackId?: string | null;
  platforms?: { platform: string; urls: string[] }[];
}

export async function POST(req: NextRequest) {
  let entries: ImportEntry[];
  try {
    entries = await req.json();
    if (!Array.isArray(entries)) throw new Error('格式錯誤');
  } catch {
    return NextResponse.json({ error: '無效的 JSON 格式，需為陣列' }, { status: 400 });
  }

  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const entry of entries) {
    const name = entry.name?.trim();
    if (!name) { results.push({ name: '(未命名)', ok: false, error: '缺少客戶名稱' }); continue; }
    try {
      const client = createClient({ name, slackId: entry.slackId?.trim() ?? undefined });
      if (Array.isArray(entry.platforms)) setClientUrls(client.id, entry.platforms);
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: String(err) });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ imported: results.length - failed, failed, results });
}
