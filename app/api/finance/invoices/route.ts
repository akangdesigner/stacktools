import { NextRequest, NextResponse } from 'next/server';
import { listInvoices, createInvoice, syncOverdueStatus } from '@/lib/financeDb';

export async function GET() {
  syncOverdueStatus();
  return NextResponse.json(listInvoices());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      client_contract_id,
      client_name,
      tax_id,
      reminder_month,
      invoice_items,
      unit_price,
      quantity,
      discount,
      tax_inclusive_amount,
      invoice_date,
      due_date,
    } = body;

    if (!client_name || !tax_id || !invoice_date || !due_date || tax_inclusive_amount === undefined) {
      return NextResponse.json({ error: '缺少必填欄位' }, { status: 400 });
    }

    const invoice = createInvoice({
      client_contract_id,
      client_name,
      tax_id,
      reminder_month,
      invoice_items: invoice_items ?? [],
      unit_price: unit_price ?? 0,
      quantity: quantity ?? 1,
      discount: discount ?? 0,
      tax_inclusive_amount,
      invoice_date,
      due_date,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '建立失敗' }, { status: 500 });
  }
}
