import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const BASE_URL = 'https://invoice-api.amego.tw';
const SELLER_TAX_ID = process.env.GUANGMAO_TAX_ID ?? '12345678';
const APP_KEY = process.env.GUANGMAO_APP_KEY ?? 'sHeq7t8G1wiQvhAuIM27';

function md5(str: string) {
  return createHash('md5').update(str).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      order_id,         // 唯一訂單編號（必填）
      buyer_name,       // 買受人名稱
      buyer_tax_id,     // 買受人統編（沒有填 0000000000）
      items,            // [{ name, qty, price }] 含稅單價
      total_amount,     // 含稅總金額（NT$）
    } = body;

    if (!order_id || !buyer_name || !items?.length || !total_amount) {
      return NextResponse.json({ error: '缺少必要欄位（order_id, buyer_name, items, total_amount）' }, { status: 400 });
    }

    const rawTaxId = buyer_tax_id?.trim() ?? '';
    // 有效統編為8位數字；其他情況填10個零（B2C 無統編）
    const hasTaxId = /^\d{8}$/.test(rawTaxId);
    const buyerIdentifier = hasTaxId ? rawTaxId : '0000000000';

    // 含稅價商品金額計算（DetailVat=1，含稅價）
    const salesAmountRaw = items.reduce(
      (s: number, i: { qty: number; price: number }) => s + Math.round(i.qty * i.price),
      0
    );

    let salesAmount = salesAmountRaw;
    let taxAmount = 0;

    if (hasTaxId) {
      // 打統編：分拆稅額
      taxAmount = salesAmount - Math.round(salesAmount / 1.05);
      salesAmount = salesAmount - taxAmount;
    }

    const invoiceData = {
      OrderId: order_id,
      BuyerIdentifier: buyerIdentifier,
      BuyerName: buyer_name,
      BuyerAddress: '',
      BuyerTelephoneNumber: '',
      BuyerEmailAddress: '',
      MainRemark: '',
      CarrierType: '',
      CarrierId1: '',
      CarrierId2: '',
      NPOBAN: '',
      ProductItem: items.map((item: { name: string; qty: number; price: number }) => ({
        Description: item.name,
        Quantity: item.qty,
        UnitPrice: item.price,
        Amount: Math.round(item.qty * item.price),
        Remark: '',
        TaxType: 1,
      })),
      SalesAmount: salesAmount,
      FreeTaxSalesAmount: 0,
      ZeroTaxSalesAmount: 0,
      TaxType: 1,
      TaxRate: '0.05',
      TaxAmount: taxAmount,
      TotalAmount: total_amount,
    };

    const dataStr = JSON.stringify(invoiceData);
    const now = Math.floor(Date.now() / 1000);
    const sign = md5(dataStr + now + APP_KEY);

    const formBody = new URLSearchParams({
      invoice: SELLER_TAX_ID,
      data: dataStr,
      time: String(now),
      sign,
    });

    const res = await fetch(`${BASE_URL}/json/f0401`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });

    const result = await res.json();

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.msg ?? '光貿 API 錯誤', code: result.code, raw: result },
        { status: 400 }
      );
    }

    return NextResponse.json({
      invoice_number: result.invoice_number,
      invoice_time: result.invoice_time,
      random_number: result.random_number,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
