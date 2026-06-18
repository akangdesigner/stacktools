import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const host = req.headers.get('host') ?? 'localhost:3001';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${proto}://${host}/api/gsc/callback`;

  if (!clientId) {
    return NextResponse.json({ error: '未設定 GOOGLE_CLIENT_ID' }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/spreadsheets email',
    access_type: 'offline',
    prompt: 'consent',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/auth?${params}`);
}
