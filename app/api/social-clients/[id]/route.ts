import { NextRequest, NextResponse } from 'next/server';
import { getClient, getClientUrls, updateClient, deleteClient, setClientUrls } from '@/lib/socialDb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = getClient(id);
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
    const platforms = getClientUrls(id);
    return NextResponse.json({ ...client, platforms });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getClient(id)) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

    const body = await req.json();
    updateClient(id, { name: body.name, slackId: body.slackId, autoMonitor: body.autoMonitor });
    if (Array.isArray(body.platforms)) setClientUrls(id, body.platforms);

    const client = getClient(id);
    const platforms = getClientUrls(id);
    return NextResponse.json({ ...client, platforms });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getClient(id)) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
    deleteClient(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
