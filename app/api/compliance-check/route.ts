import { NextRequest, NextResponse } from 'next/server';
import {
  CLIENT_RULES,
  detectClient,
  fetchArticleText,
  type Block,
  parseExtraBanned,
  runComplianceCheck,
  textToBlocks,
} from '@/lib/compliance-check';

// 文案法規檢查 API：貼文章網址或純文字，選客戶規則，回傳每句的禁詞命中＋Jev 風險分數
// 一篇文章百來句約 10 秒，直接同步回傳，不做背景 job

// GET：給前端列出可選的客戶規則（含禁詞，方便畫面上展開看）
export async function GET() {
  return NextResponse.json({
    clients: CLIENT_RULES.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      banned: c.banned,
      required: c.required.map((r) => r.label),
    })),
  });
}

// 改寫用的規則摘要：出自小積木的去 AI 味規則（GitHub akangdesigner/qkangber docs/anti-ai-style.md）＋化粧品／食品廣告法規
const REWRITE_SYSTEM = `你是繁體中文文案編輯，負責改寫「單一句子」，讓它沒有 AI 味、也不違反台灣廣告法規。
規則：
- 反轉句：不要用「不是A而是B」「不只A更B」「…，而非…」「…，不是…」，把判斷正面講完。
- 報幕／過渡詞：刪掉「首先、舉例來說、簡單來說、以下逐一說明、值得注意的是」這類宣告，直接講內容。
- 浮誇詞：「至關重要、關鍵、顯著」換成具體後果或直接刪掉。
- 社群假詞：不用穩、撐、接住、踩坑、踩雷，直接講發生什麼事。
- 標題：不叫讀者「先搞懂／先了解／先認識」做任何事（換成同義詞也不行）、不用冒號加聳動斷言、不寫懸念或口號，也不要寫成名詞堆疊的冷標籤（「…說明」「…介紹」「…解析」），要改成有動詞、讀起來是一句話的短句。例：「面膜種類與功效定位：先搞懂再開始挑」→「面膜有哪些種類，各適合什麼膚況」。
- 假擬人：產品、成分不會「對付、衝著、顧到、搞定」，只寫成分是什麼、作用和結果。
- 不用破折號（——），標點一律用全形（，。：）。
- 法規：不宣稱醫療效果、不宣稱改變身體結構或生理機能、不用促銷招攬與絕對用語；有禁詞就換掉。
- 保留原句的資訊與意思，不新增原句沒有的數字或事實，長度跟原句差不多。
只輸出改寫後的那一句，不要解釋、不要加引號。`;

// 改寫單句：前端按「改寫」時呼叫，帶這句被抓到的問題
async function rewriteSentence(sentence: string, issues: string[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY 環境變數');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: `這句被抓到的問題：${issues.join('、') || '（未指定）'}\n\n原句：${sentence}` },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `改寫失敗：HTTP ${res.status}`);
  const out = (data.choices?.[0]?.message?.content ?? '').trim().replace(/^[「"]|[」"]$/g, '');
  if (!out) throw new Error('改寫結果是空的');
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string; text?: string; clientId?: string; extraBanned?: string; mode?: 'legal' | 'ai';
      action?: 'rewrite'; sentence?: string; issues?: string[];
    };

    if (body.action === 'rewrite') {
      if (!body.sentence?.trim()) return NextResponse.json({ error: '沒有要改寫的句子' }, { status: 400 });
      return NextResponse.json({ rewritten: await rewriteSentence(body.sentence.trim(), body.issues ?? []) });
    }
    let title = '';
    let blocks: Block[];
    if (body.url?.trim()) {
      const url = /^https?:\/\//i.test(body.url.trim()) ? body.url.trim() : 'https://' + body.url.trim();
      const article = await fetchArticleText(url);
      title = article.title;
      blocks = article.blocks;
    } else if (body.text?.trim()) {
      blocks = textToBlocks(body.text);
    } else {
      return NextResponse.json({ error: '請貼文章網址或文字' }, { status: 400 });
    }
    if (blocks.length === 0) return NextResponse.json({ error: '抓不到文章內文' }, { status: 400 });

    // 客戶：畫面上有指定就用指定的，沒指定（自動）就從網址和內文認
    const picked = CLIENT_RULES.find((c) => c.id === body.clientId);
    const ruleSet =
      picked ?? detectClient(body.url ?? '', [title, ...blocks.map((b) => b.text)].join('\n'));

    const report = await runComplianceCheck({
      mode: body.mode === 'ai' ? 'ai' : 'legal',
      blocks,
      title,
      ruleSet,
      extraBanned: parseExtraBanned(body.extraBanned ?? ''),
    });
    return NextResponse.json({ ...report, clientAuto: !picked });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
