import { NextResponse } from 'next/server';
import { getToken } from '@/lib/gscDb';
import { getAccessToken } from '@/lib/gscAuth';

export async function GET() {
  const token = getToken();
  if (!token) return NextResponse.json({ authorized: false });

  try {
    const accessToken = await getAccessToken();
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as { email?: string };
    return NextResponse.json({ authorized: true, email: data.email ?? null });
  } catch {
    return NextResponse.json({ authorized: true, email: null });
  }
}
