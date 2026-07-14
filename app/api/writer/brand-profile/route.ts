import { NextRequest, NextResponse } from 'next/server';
import { listBrandProfiles, getBrandProfile, upsertBrandProfile } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (clientId) {
    const profile = getBrandProfile(Number(clientId));
    return NextResponse.json(profile ?? { gsc_client_id: Number(clientId), brand_url: '', brand_description: '', writing_rules: '', banned_words: '' });
  }
  return NextResponse.json(listBrandProfiles());
}

export async function POST(req: NextRequest) {
  const { gsc_client_id, brand_url, brand_description, writing_rules, banned_words } = await req.json();
  if (!gsc_client_id) return NextResponse.json({ error: 'gsc_client_id required' }, { status: 400 });
  upsertBrandProfile(Number(gsc_client_id), {
    brand_url: brand_url ?? '',
    brand_description: brand_description ?? '',
    writing_rules: writing_rules ?? '',
    banned_words: banned_words ?? '',
  });
  return NextResponse.json({ ok: true });
}
