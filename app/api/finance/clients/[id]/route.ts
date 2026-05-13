import { NextRequest, NextResponse } from 'next/server';
import { initNeonClients, getNeonClient, upsertNeonClient, deleteNeonClient, getContractsByChannelId } from '@/lib/neonClient';
import { listInvoicesByClientId } from '@/lib/financeDb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await initNeonClients();
    const [client, contracts] = await Promise.all([
      getNeonClient(id),
      getContractsByChannelId(id),
    ]);
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
    const invoices = listInvoicesByClientId(id);
    return NextResponse.json({ ...client, contracts, invoices });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '載入失敗' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { tax_id, contact_name, contact_email, contact_phone, notes } = body;

    if (tax_id !== undefined && tax_id !== null && tax_id.trim() !== '' && !/^\d{8}$/.test(tax_id.trim())) {
      return NextResponse.json({ error: '統一編號須為 8 位純數字' }, { status: 400 });
    }

    await initNeonClients();
    const updated = await upsertNeonClient(id, {
      tax_id: tax_id?.trim() || null,
      contact_name: contact_name?.trim() || null,
      contact_email: contact_email?.trim() || null,
      contact_phone: contact_phone?.trim() || null,
      notes: notes?.trim() || null,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await initNeonClients();
    const client = await getNeonClient(id);
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

    const invoices = listInvoicesByClientId(id);
    const hasActive = invoices.some(inv => ['pending', 'overdue'].includes(inv.status));
    if (hasActive) return NextResponse.json({ error: '此客戶尚有未結清發票，無法清除資料' }, { status: 400 });

    await deleteNeonClient(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '刪除失敗' }, { status: 500 });
  }
}
