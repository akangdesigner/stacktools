import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TavilyExtractResult = { url: string; raw_content: string };
type TavilyExtractResponse = { results?: TavilyExtractResult[]; failed_results?: { url: string; error: string }[] };

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')?.trim();
  if (!url) return NextResponse.json({ error: '缺少 url' }, { status: 400 });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: '未設定 TAVILY_API_KEY' }, { status: 500 });

  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Tavily Extract 錯誤：${err}` }, { status: 502 });
    }

    const data = await res.json() as TavilyExtractResponse;
    const content = data.results?.[0]?.raw_content ?? '';
    // 截取前 3000 字，避免 prompt 過長
    return NextResponse.json({ content: content.slice(0, 3000) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '爬取失敗' }, { status: 500 });
  }
}
