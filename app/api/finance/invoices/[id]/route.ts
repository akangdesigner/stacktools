import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice, deleteInvoice } from '@/lib/financeDb';
import { createHash } from 'crypto';
import type { InvoiceItem } from '@/lib/financeDb';

const GUANGMAO_BASE = 'https://invoice-api.amego.tw';
const SELLER_TAX_ID = process.env.GUANGMAO_TAX_ID ?? '12345678';
const APP_KEY = process.env.GUANGMAO_APP_KEY ?? 'sHeq7t8G1wiQvhAuIM27';

function sign(data: string, time: number) {
  return createHash('md5').update(data + time + APP_KEY).digest('hex');
}

async function guangmaoPost(path: string, payload: object) {
  const dataStr = JSON.stringify(payload);
  const now = Math.floor(Date.now() / 1000);
  const res = await fetch(`${GUANGMAO_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      invoice: SELLER_TAX_ID,
      data: dataStr,
      time: String(now),
      sign: sign(dataStr, now),
    }).toString(),
  });
  return res.json();
}

async function issueInvoice(params: {
  orderId: string;
  buyerName: string;
  buyerTaxId: string;
  items: InvoiceItem[];
  totalAmount: number;
}): Promise<string> {
  const { orderId, buyerName, buyerTaxId, items, totalAmount } = params;
  const rawTaxId = buyerTaxId.trim();
  const hasTaxId = /^\d{8}$/.test(rawTaxId);

  const description = items.length > 0
    ? items.map(i => i.name).join('、').slice(0, 256)
    : '服務費用';

  let salesAmount = totalAmount;
  let taxAmount = 0;
  if (hasTaxId) {
    salesAmount = Math.round(totalAmount / 1.05);
    taxAmount = totalAmount - salesAmount;
  }

  const result = await guangmaoPost('/json/f0401', {
    OrderId: orderId,
    BuyerIdentifier: hasTaxId ? rawTaxId : '0000000000',
    BuyerName: buyerName,
    BuyerAddress: '', BuyerTelephoneNumber: '', BuyerEmailAddress: '',
    MainRemark: '', CarrierType: '', CarrierId1: '', CarrierId2: '', NPOBAN: '',
    ProductItem: [{ Description: description, Quantity: 1, UnitPrice: totalAmount, Amount: totalAmount, Remark: '', TaxType: 1 }],
    SalesAmount: salesAmount,
    FreeTaxSalesAmount: 0,
    ZeroTaxSalesAmount: 0,
    TaxType: 1,
    TaxRate: '0.05',
    TaxAmount: taxAmount,
    TotalAmount: totalAmount,
  });

  if (result.code !== 0) throw new Error(result.msg ?? `光貿錯誤 (code: ${result.code})`);
  return result.invoice_number as string;
}

async function voidInvoice(invoiceNumber: string, invoiceDate: string): Promise<void> {
  const [year, month, day] = invoiceDate.split('-');
  const rocDate = `${parseInt(year) - 1911}${month}${day}`;

  const result = await guangmaoPost('/json/f0501', {
    InvoiceNumber: invoiceNumber,
    InvoiceDate: rocDate,
    Reason: '作廢',
  });

  if (result.code !== 0) throw new Error(result.msg ?? `作廢失敗 (code: ${result.code})`);
}

// ── Handlers ───────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = getInvoice(id);
  if (!invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = getInvoice(id);
  if (!invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 });
  // 直接從系統移除這筆紀錄（光貿那邊的發票號碼不受影響，需作廢請另外走作廢）
  deleteInvoice(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = getInvoice(id);
    if (!invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 });

    const body = await req.json();
    const { action } = body;

    if (action === 'issue') {
      if (invoice.invoice_number) return NextResponse.json({ error: '此發票已開立' }, { status: 400 });
      const invoiceNumber = await issueInvoice({
        orderId: `INV-${Date.now()}`,
        buyerName: invoice.client_name,
        buyerTaxId: invoice.tax_id,
        items: invoice.invoice_items,
        totalAmount: invoice.tax_inclusive_amount,
      });
      updateInvoice(id, { invoice_number: invoiceNumber });
      return NextResponse.json(getInvoice(id));
    }

    if (action === 'void') {
      if (!invoice.invoice_number) return NextResponse.json({ error: '草稿無需作廢，請直接刪除' }, { status: 400 });
      if (invoice.status === 'voided') return NextResponse.json({ error: '此發票已作廢' }, { status: 400 });
      await voidInvoice(invoice.invoice_number, invoice.invoice_date);
      updateInvoice(id, { status: 'voided' });
      return NextResponse.json(getInvoice(id));
    }

    // 確認收款
    if (body.status === 'paid') {
      updateInvoice(id, {
        paid_date: body.paid_date,
        payment_account_last5: body.payment_account_last5,
        status: 'paid',
      });
      return NextResponse.json(getInvoice(id));
    }

    // 一般編輯（僅限草稿）
    if (invoice.invoice_number) return NextResponse.json({ error: '已開立的發票不可編輯，請先作廢再重新建立' }, { status: 400 });
    const { client_name, tax_id, invoice_items, unit_price, discount, tax_inclusive_amount, invoice_date, due_date } = body;
    updateInvoice(id, { client_name, tax_id, invoice_items, unit_price, discount, tax_inclusive_amount, invoice_date, due_date });
    return NextResponse.json(getInvoice(id));

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失敗' }, { status: 500 });
  }
}
