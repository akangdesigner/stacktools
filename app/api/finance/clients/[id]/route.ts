import { NextRequest, NextResponse } from 'next/server';
import { getClient, updateClient, deleteClient, listInvoicesByClientId } from '@/lib/financeDb';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });
  const invoices = listInvoicesByClientId(id);
  return NextResponse.json({ ...client, invoices });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = getClient(id);
    if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

    const body = await req.json();
    const { name, tax_id, contact_name, contact_email, contact_phone, notes } = body;

    if (name !== undefined && !name.trim()) return NextResponse.json({ error: '客戶名稱不可為空' }, { status: 400 });
    if (tax_id !== undefined && !/^\d{8}$/.test(tax_id.trim())) return NextResponse.json({ error: '統一編號須為 8 位純數字' }, { status: 400 });

    updateClient(id, {
      name: name?.trim(),
      tax_id: tax_id?.trim(),
      contact_name: contact_name?.trim() ?? undefined,
      contact_email: contact_email?.trim() ?? undefined,
      contact_phone: contact_phone?.trim() ?? undefined,
      notes: notes?.trim() ?? undefined,
    });
    return NextResponse.json(getClient(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) return NextResponse.json({ error: '找不到客戶' }, { status: 404 });

  const invoices = listInvoicesByClientId(id);
  const hasActive = invoices.some(inv => ['pending', 'overdue'].includes(inv.status));
  if (hasActive) return NextResponse.json({ error: '此客戶尚有未結清發票，無法刪除' }, { status: 400 });

  deleteClient(id);
  return NextResponse.json({ ok: true });
}
