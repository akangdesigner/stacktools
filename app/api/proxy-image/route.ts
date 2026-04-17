import { NextRequest, NextResponse } from 'next/server';

const ALLOWED = /\.(fbcdn\.net|cdninstagram\.com|instagram\.com)/i;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('missing url', { status: 400 });
  if (!ALLOWED.test(url)) return new NextResponse('forbidden', { status: 403 });

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.threads.net/',
      },
    });
    if (!res.ok) return new NextResponse('fetch failed', { status: res.status });

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('error', { status: 500 });
  }
}
