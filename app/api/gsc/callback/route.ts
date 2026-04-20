import { NextRequest, NextResponse } from 'next/server';
import { setToken } from '@/lib/gscDb';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  const host = req.headers.get('host') ?? 'localhost:3001';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const baseUrl = `${proto}://${host}`;

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/gsc?error=access_denied`);
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'https://stacktools.zeabur.app/api/gsc/callback';

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json() as { refresh_token?: string; error?: string };

  if (!res.ok || !data.refresh_token) {
    return NextResponse.redirect(`${baseUrl}/gsc?error=token_failed`);
  }

  setToken(data.refresh_token);

  return NextResponse.redirect(`${baseUrl}/gsc?authorized=1`);
}
