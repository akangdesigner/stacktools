import { NextRequest, NextResponse } from 'next/server';
import { listAllSnapshots, createSnapshot, deleteSnapshot, getPageChangeLogById } from '@/lib/gscDb';
import { getAccessToken } from '@/lib/gscAuth';

const GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function queryGsc(token: string, siteUrl: string, pageUrl: string, startDate: string, endDate: string) {
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
  return NextResponse.json(listAllSnapshots());
}

export async function POST(req: NextRequest) {
  try {
    const { log_id } = await req.json();

    const log = getPageChangeLogById(Number(log_id));
    if (!log) return NextResponse.json({ error: '找不到原始紀錄' }, { status: 400 });

    // GSC 有 1-2 天延遲，預設用 3 天前作為快照日期
    const snapshotDate = shiftDate(new Date().toISOString().split('T')[0], -3);

    let clicks: number | null = null;
    let impressions: number | null = null;
    let ctr: number | null = null;
    let avg_position: number | null = null;

    try {
      const token = await getAccessToken();
      let row = await queryGsc(token, log.site_url, log.page_url, snapshotDate, snapshotDate);
      if (!row || row.position < 1) {
        row = await queryGsc(token, log.site_url, log.page_url, shiftDate(snapshotDate, -1), snapshotDate);
      }
      if (row && row.position >= 1) {
        clicks = row.clicks ?? null;
        impressions = row.impressions ?? null;
        ctr = row.ctr != null ? Math.round(row.ctr * 1000) / 10 : null;
        avg_position = Math.round(row.position * 10) / 10;
      }
    } catch {
      // GSC 失敗時仍儲存快照，metrics 留 null
    }

    const snapshot = createSnapshot(Number(log_id), {
      snapshot_date: snapshotDate,
      clicks,
      impressions,
      ctr,
      avg_position,
    });

    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    deleteSnapshot(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
