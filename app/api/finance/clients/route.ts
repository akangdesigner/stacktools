import { NextRequest, NextResponse } from 'next/server';
import { listClientsWithStats, createClient } from '@/lib/financeDb';

export async function GET() {
  const clients = listClientsWithStats();
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, tax_id, contact_name, contact_email, contact_phone, notes } = body;

    if (!name?.trim()) return NextResponse.json({ error: '請填寫客戶名稱' }, { status: 400 });
    if (!/^\d{8}$/.test(tax_id?.trim() ?? '')) return NextResponse.json({ error: '統一編號須為 8 位純數字' }, { status: 400 });

    const client = createClient({
      name: name.trim(),
      tax_id: tax_id.trim(),
      contact_name: contact_name?.trim() || undefined,
      contact_email: contact_email?.trim() || undefined,
      contact_phone: contact_phone?.trim() || undefined,
      notes: notes?.trim() || undefined,
    });
    return NextResponse.json(client, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '建立失敗' }, { status: 500 });
  }
}
