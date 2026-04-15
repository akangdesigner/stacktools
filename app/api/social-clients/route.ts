import { NextRequest, NextResponse } from 'next/server';
import { listClients, createClient, exportAllClients } from '@/lib/socialDb';

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get('full') === 'true') {
      return NextResponse.json(exportAllClients());
    }
    return NextResponse.json(listClients());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, slackId } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: '請填入客戶名稱' }, { status: 400 });
    }
    const client = createClient({ name: name.trim(), slackId: slackId?.trim() });
    return NextResponse.json(client, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
