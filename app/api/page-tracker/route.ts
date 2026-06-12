import { NextRequest, NextResponse } from 'next/server';
import { listPageChangeLogs, createPageChangeLog, deletePageChangeLog, listClients } from '@/lib/gscDb';
import { getAccessToken } from '@/lib/gscAuth';

const GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function queryGsc(
  token: string,
  siteUrl: string,
  pageUrl: string,
  startDate: string,
  endDate: string,
) {
  const res = await fetch(
    `${GSC_API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', expression: pageUrl }] }],
        rowLimit: 1,
      }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.rows?.[0] ?? null;
}

export async function GET() {
  return NextResponse.json(listPageChangeLogs());
}

export async function POST(req: NextRequest) {
  try {
    const { client_id, page_url, change_date, gsc_date, title, description } = await req.json();

    const clients = listClients();
    const client = clients.find(c => c.id === Number(client_id));
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 400 });

    // gsc_date 是實際查 GSC 的日期（前端預設 today-3）；change_date 是網站改動日
    const queryDate: string = gsc_date ?? shiftDate(new Date().toISOString().split('T')[0], -3);

    let clicks: number | null = null;
    let impressions: number | null = null;
    let ctr: number | null = null;
    let avg_position: number | null = null;

    try {
      const token = await getAccessToken();
      let row = await queryGsc(token, client.site_url, page_url, queryDate, queryDate);
      if (!row || row.position < 1) {
        row = await queryGsc(token, client.site_url, page_url, shiftDate(queryDate, -1), queryDate);
      }
      if (row && row.position >= 1) {
        clicks = row.clicks ?? null;
        impressions = row.impressions ?? null;
        ctr = row.ctr != null ? Math.round(row.ctr * 1000) / 10 : null;
        avg_position = Math.round(row.position * 10) / 10;
      }
    } catch {
      // GSC 取不到時仍正常儲存紀錄，metrics 留 null
    }

    const log = createPageChangeLog({
      client_id: Number(client_id),
      client_name: client.name,
      site_url: client.site_url,
      page_url,
      change_date,
      gsc_date: queryDate,
      title: title ?? null,
      description,
      clicks,
      impressions,
      ctr,
      avg_position,
    });

    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    deletePageChangeLog(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
