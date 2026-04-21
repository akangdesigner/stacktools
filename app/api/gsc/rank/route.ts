import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';

const WINDOW_DAYS = 90;

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscResponse {
  rows?: GscRow[];
  error?: { message: string };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function queryRange(
  accessToken: string,
  siteUrl: string,
  keyword: string,
  startDate: string,
  endDate: string
): Promise<{ found: boolean; position?: number; clicks?: number; impressions?: number; ctr?: number; error?: string }> {
  const apiUrl = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['query'],
      dimensionFilterGroups: [{
        filters: [
          { dimension: 'query', operator: 'equals', expression: keyword.trim() },
        ],
      }],
      rowLimit: 1,
    }),
  });

  const data = await res.json() as GscResponse;

  if (!res.ok) {
    return { found: false, error: data.error?.message ?? `GSC API 錯誤（${res.status}）` };
  }

  const row = data.rows?.[0];
  if (!row) return { found: false };

  return {
    found: true,
    position: Math.round(row.position * 10) / 10,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 1000) / 10,
  };
}

export async function POST(req: NextRequest) {
  let body: { siteUrl?: string; keywords?: string[]; endDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { siteUrl, keywords, endDate } = body;
  if (!siteUrl?.trim() || !keywords?.length || !endDate) {
    return NextResponse.json({ error: '請填寫站台網址、關鍵字與截止日期' }, { status: 400 });
  }

  // 本週：截止日往前 WINDOW_DAYS 天
  const bEnd = endDate;
  const bStart = addDays(endDate, -(WINDOW_DAYS - 1));

  // 上週：截止日再往前 7 天，同樣 WINDOW_DAYS 天
  const aEnd = addDays(endDate, -7);
  const aStart = addDays(aEnd, -(WINDOW_DAYS - 1));

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  const results = await Promise.all(
    keywords.map(async (kw) => {
      const [a, b] = await Promise.all([
        queryRange(accessToken, siteUrl, kw, aStart, aEnd),
        queryRange(accessToken, siteUrl, kw, bStart, bEnd),
      ]);
      return { keyword: kw, a, b };
    })
  );

  const firstError = results.find(r => r.a.error || r.b.error);
  if (firstError) {
    return NextResponse.json({ error: firstError.a.error ?? firstError.b.error }, { status: 502 });
  }

  return NextResponse.json({
    results,
    aRange: { start: aStart, end: aEnd },
    bRange: { start: bStart, end: bEnd },
  });
}
