import { NextResponse } from 'next/server';
import { getToken } from '@/lib/gscDb';

export async function GET() {
  const token = getToken();
  return NextResponse.json({ authorized: !!token });
}
