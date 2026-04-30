import { NextResponse } from 'next/server';
import { getToken } from '@/lib/gscDb';

export async function GET() {
  const token = getToken();
  if (!token) return NextResponse.json({ authorized: false });
  return NextResponse.json({ authorized: true, email: null });
}
