import { NextRequest, NextResponse } from 'next/server';

const cache = new Map<string, { url: string; expires: number }>();

const DICEBEAR_FALLBACK = (seed: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear`;

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) return new NextResponse('Missing username', { status: 400 });

  // Serve from cache if still valid
  const cached = cache.get(username);
  if (cached && Date.now() < cached.expires) {
    return NextResponse.redirect(cached.url);
  }

  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      ?? html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);

    if (!match?.[1]) throw new Error('og:image not found');

    const imageUrl = match[1].replace(/&amp;/g, '&');
    // Cache for 1 hour (CDN URLs have tokens that expire)
    cache.set(username, { url: imageUrl, expires: Date.now() + 3_600_000 });
    return NextResponse.redirect(imageUrl);
  } catch {
    return NextResponse.redirect(DICEBEAR_FALLBACK(username));
  }
}
