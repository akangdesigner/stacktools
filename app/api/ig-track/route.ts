import { NextRequest, NextResponse } from 'next/server';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzjYdCjalNHzt3PbiWaUL2rSFV9KV4PpsGwmUdgzMqIriMySINjh0ChyQgawSTzPUslDg/exec';

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: '缺少 url 參數' }, { status: 400 });
    }

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', url }),
      redirect: 'follow',
    });

    const text = await res.text();
    if (text.startsWith('<')) {
      return NextResponse.json({ error: 'Apps Script 需要驗證，請將部署的存取權改為「所有人（包括匿名使用者）」' }, { status: 403 });
    }
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, name } = body;

    if (!url || !url.startsWith('https://www.instagram.com/')) {
      return NextResponse.json({ error: '請輸入有效的 Instagram 網址' }, { status: 400 });
    }

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `"${url}"`, name }),
      redirect: 'follow',
    });

    const text = await res.text();
    if (text.startsWith('<')) {
      return NextResponse.json({ error: 'Apps Script 需要驗證，請將部署的存取權改為「所有人（包括匿名使用者）」' }, { status: 403 });
    }
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
