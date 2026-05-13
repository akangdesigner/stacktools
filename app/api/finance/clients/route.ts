import { NextResponse } from 'next/server';
import { initNeonClients, listNeonClients } from '@/lib/neonClient';
import { listInvoicesByClientId } from '@/lib/financeDb';

export async function GET() {
  try {
    await initNeonClients();
    const clients = await listNeonClients();
    const withStats = clients.map(c => {
      const invoices = listInvoicesByClientId(c.channel_id);
      const invoice_count = invoices.length;
      const outstanding_amount = invoices
        .filter(i => ['pending', 'overdue'].includes(i.status))
        .reduce((s, i) => s + i.tax_inclusive_amount, 0);
      const last_invoice_date = invoices.map(i => i.invoice_date).sort().at(-1) ?? null;
      return { ...c, invoice_count, outstanding_amount, last_invoice_date };
    });
    return NextResponse.json(withStats);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '載入失敗' }, { status: 500 });
  }
}
