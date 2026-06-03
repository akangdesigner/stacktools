import { NextRequest, NextResponse } from 'next/server';
import { getSchedule, getClients, getProgressBySheetId, updateScheduleCell, updateCell, appendRow, insertRow, deleteRow } from '@/lib/writerSheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sheet = req.nextUrl.searchParams.get('sheet');
  const sheetId = req.nextUrl.searchParams.get('sheetId');
  const tab = req.nextUrl.searchParams.get('tab') ?? undefined;
  const skipRows = parseInt(req.nextUrl.searchParams.get('skip') ?? '0', 10) || 0;

  if (!sheet || !['schedule', 'clients', 'progress'].includes(sheet)) {
    return NextResponse.json({ error: '請指定 sheet 參數（schedule / clients / progress）' }, { status: 400 });
  }
  if (sheet === 'progress' && !sheetId) {
    return NextResponse.json({ error: '讀取進度表需提供 sheetId' }, { status: 400 });
  }

  try {
    let data;
    if (sheet === 'schedule') data = await getSchedule();
    else if (sheet === 'clients') data = await getClients();
    else data = await getProgressBySheetId(sheetId!, tab, skipRows);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const isAuth = msg.includes('尚未授權') || msg.includes('尚未設定');
    return NextResponse.json({ error: msg }, { status: isAuth ? 401 : 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json() as { sheetId?: string; tabName?: string; sheetRow?: number };
  if (!body.sheetId || !body.tabName || body.sheetRow === undefined) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
  }
  try {
    await deleteRow(body.sheetId, body.tabName, body.sheetRow);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { sheetId?: string; tabName?: string; initialValues?: string[]; sheetRow?: number };
  if (!body.sheetId || !body.tabName) {
    return NextResponse.json({ error: '缺少 sheetId / tabName' }, { status: 400 });
  }
  try {
    if (body.sheetRow !== undefined) {
      await insertRow(body.sheetId, body.tabName, body.sheetRow, body.initialValues ?? []);
    } else {
      await appendRow(body.sheetId, body.tabName, body.initialValues ?? []);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as {
    rowIdx?: number; colIdx?: number; value?: string;
    sheetId?: string; tabName?: string; sheetRow?: number;
  };

  try {
    if (body.sheetId && body.tabName && body.sheetRow !== undefined && body.colIdx !== undefined) {
      // 通用寫入（個人進度表等）
      await updateCell(body.sheetId, body.tabName, body.sheetRow, body.colIdx, body.value ?? '');
    } else if (body.rowIdx !== undefined && body.colIdx !== undefined) {
      // 排程表寫入
      await updateScheduleCell(body.rowIdx, body.colIdx, body.value ?? '');
    } else {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
