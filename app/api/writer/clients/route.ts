import { NextRequest, NextResponse } from 'next/server';
import { listClients, addClient } from '@/lib/writerDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(listClients());
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; progressSheetId?: string; progressSheetTab?: string };
  const { name, progressSheetId, progressSheetTab = '' } = body;
  if (!name || !progressSheetId) {
    return NextResponse.json({ error: '請填入客戶名稱與 Sheet ID' }, { status: 400 });
  }
  const client = addClient(name.trim(), progressSheetId.trim(), progressSheetTab.trim());
  return NextResponse.json(client, { status: 201 });
}
