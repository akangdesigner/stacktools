import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Proxy any image URL through our server
async function proxyImage(imageUrl: string): Promise<NextResponse> {
  const res = await fetch(imageUrl, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status}`);
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function GET(req: NextRequest) {
  // Mode 1: proxy a direct image URL from the sheet
  const url = req.nextUrl.searchParams.get('url');
  if (url) {
    try {
      return await proxyImage(url);
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  // Mode 2: scrape Instagram og:image by username (fallback: DiceBear)
  const username = req.nextUrl.searchParams.get('username');
  if (!username) return new NextResponse('Missing params', { status: 400 });

  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      headers: { ...HEADERS, 'Accept': 'text/html,*/*' },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const html = await res.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    if (!match?.[1]) throw new Error('og:image not found');
    return await proxyImage(match[1].replace(/&amp;/g, '&'));
  } catch {
    const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundType=gradientLinear`;
    return NextResponse.redirect(fallback);
  }
}
