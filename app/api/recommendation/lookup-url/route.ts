import { NextRequest, NextResponse } from 'next/server';
import { findOfficialUrlForBrand } from '@/lib/recommendation-step1';

// 使用者在確認畫面把備選品牌換上正式名單、或手動新增品牌時，即時查一次官方網址
export async function POST(req: NextRequest) {
  const { brandName, searchTerm } = await req.json();

  if (!brandName || !searchTerm) {
    return NextResponse.json({ error: '缺少 brandName 或 searchTerm' }, { status: 400 });
  }

  const { url, title } = await findOfficialUrlForBrand(String(brandName).trim(), String(searchTerm).trim());
  return NextResponse.json({ official_url: url, official_url_title: title });
}
