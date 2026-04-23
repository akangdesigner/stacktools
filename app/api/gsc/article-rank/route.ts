import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/gscAuth';
import { listClients } from '@/lib/gscDb';

const GSC_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';

function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function normalizeUrl(url: string): string {
  try {
    return encodeURI(decodeURI(url));
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    clientId?: number;
    pages?: { title: string; url: string }[];
    endDate?: string;
  };

  if (!body.clientId || !body.pages?.length || !body.endDate) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
  }

  const clients = listClients();
  const client = clients.find(c => c.id === body.clientId);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json({ error: String(err), needsAuth: true }, { status: 401 });
  }

  const endDate = body.endDate;
  const startDate = subtractMonths(endDate, 3);

  // 先用第一筆測試 GSC 是否可存取
  const testUrl = body.pages[0].url;
  const testRes = await fetch(
    `${GSC_BASE}/sites/${encodeURIComponent(client.site_url)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate, endDate,
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', expression: testUrl }] }],
        rowLimit: 1,
      }),
    }
  );
  if (!testRes.ok) {
    const errData = await testRes.json() as { error?: { message?: string; status?: string } };
    const msg = errData.error?.message ?? `GSC 回應 HTTP ${testRes.status}`;
    return NextResponse.json({ error: `GSC 查詢失敗：${msg}（site: ${client.site_url}）` }, { status: 502 });
  }

  const results = await Promise.all(
    body.pages.map(async ({ title, url }) => {
      const normalizedUrl = normalizeUrl(url);
      try {
        const res = await fetch(
          `${GSC_BASE}/sites/${encodeURIComponent(client.site_url)}/searchAnalytics/query`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startDate,
              endDate,
              dimensionFilterGroups: [{
                filters: [{ dimension: 'page', expression: normalizedUrl }],
              }],
              rowLimit: 1,
            }),
          }
        );
        if (!res.ok) return { title, url: normalizedUrl, position: null };
        const data = await res.json() as { rows?: { position: number }[] };
        const row = (data.rows ?? [])[0];
        const position = row && row.position >= 1 ? Math.floor(row.position) : null;
        return { title, url: normalizedUrl, position };
      } catch {
        return { title, url: normalizedUrl, position: null };
      }
    })
  );

  return NextResponse.json({ results });
}
