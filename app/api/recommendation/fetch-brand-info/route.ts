import { NextRequest, NextResponse } from "next/server";
import { fetchBrandInfo } from "@/lib/brand-info-fetcher";

interface BrandInput {
  brand_name?: string;
  official_url?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const brands = body?.brands as BrandInput[] | undefined;

  if (!Array.isArray(brands) || brands.length === 0) {
    return NextResponse.json({ error: "缺少品牌清單" }, { status: 400 });
  }

  const results = await Promise.all(
    brands.map((b) =>
      fetchBrandInfo(String(b?.brand_name ?? "").trim(), String(b?.official_url ?? "").trim())
    )
  );

  return NextResponse.json({ brands: results });
}
