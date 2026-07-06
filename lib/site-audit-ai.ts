import { LEVEL, CATEGORY } from './site-audit-rules';
import type { CheckResult, CheckStatus } from './site-audit-rules';

// ── 網站技術健檢：AI 補語意層 ───────────────────────────
// 規則層判不了的兩項語意題，交給 Claude（走 OpenRouter，與 TKD 工具同一套）：
//   ⑧ 結構化數據 (Schema) 內容夠不夠
//   ⑨ E-E-A-T 權威訊號足不足
// 沒設 API key 或呼叫失敗時，回退成 warn（標「AI 未判斷」），不讓整個健檢炸掉。

const MODEL = 'anthropic/claude-haiku-4.5';

// AI 判斷所需的原料（由 site-audit-rules 的 runHtmlRules 產出）
export type AiAuditInput = {
  url: string;
  jsonLdTypes: string[]; // 頁面所有 JSON-LD 的 @type 清單
  jsonLdRaw: string;     // JSON-LD 原始內容（已截斷）
  mainText: string;      // 頁面主要文字（已截斷）
};

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools Site Audit',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      // 一定要設上限：不設的話 OpenRouter 會用模型上限預扣額度，餘額不足時每次都 402（TKD 踩過的坑）
      max_tokens: 800,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(input: AiAuditInput): string {
  return `你是資深 SEO 技術顧問。以下是一個網頁的結構化數據與內文摘要，請判斷兩個項目，各給一個狀態與一句中文說明。

【頁面網址】${input.url}

【偵測到的 JSON-LD 型別】${input.jsonLdTypes.length ? input.jsonLdTypes.join('、') : '（無）'}

【JSON-LD 原始內容】
${input.jsonLdRaw || '（頁面沒有任何 JSON-LD 結構化數據）'}

【頁面內文摘要】
${input.mainText || '（抓不到內文）'}

請判斷：
1. schema（結構化數據是否足夠）：檢查是否具備常見且必要的 Schema（如電商應有 Product、在地商家應有 LocalBusiness 且欄位完整、文章頁應有 Article、導覽應有 BreadcrumbList）。缺關鍵 Schema 或內容明顯不足→"fail"；有但可再補強→"warn"；充足→"ok"。
2. eeat（E-E-A-T 權威訊號）：檢查內文是否有作者資訊、專業證照、獲獎紀錄、媒體報導、真實客戶評論、關於我們等信任訊號。幾乎沒有→"fail"；有一些但薄弱→"warn"；充足→"ok"。

只回傳 JSON，格式如下（message 用繁體中文、一句話、具體指出依據）：
{"schema":{"status":"ok|warn|fail","message":"..."},"eeat":{"status":"ok|warn|fail","message":"..."}}`;
}

// 從 AI 回覆中容錯解析出 JSON（可能被 ```json 包住或夾雜前後文字）
function parseAiJson(text: string): {
  schema?: { status?: string; message?: string };
  eeat?: { status?: string; message?: string };
} | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// 把 AI 回的 status 字串收斂成合法的 CheckStatus，非法值一律當 warn
function normStatus(s: string | undefined): CheckStatus {
  return s === 'ok' || s === 'warn' || s === 'fail' ? s : 'warn';
}

// AI 層總入口：回傳 Schema 與 E-E-A-T 兩項 CheckResult
export async function runAiChecks(input: AiAuditInput): Promise<CheckResult[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // 兩項的固定欄位（影響層級 / 分類 / 確認事項），對齊表上原文
  const SCHEMA = { key: 'schema', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '結構化數據 (Schema)' };
  const EEAT = { key: 'eeat', level: LEVEL.EFFICIENCY, category: CATEGORY.EXTERNAL, item: '符合 E-E-A-T 原則' };

  // 沒 key 或呼叫失敗時的回退結果（標 warn、註明未經 AI 判斷）
  const fallback = (reason: string): CheckResult[] => [
    { ...SCHEMA, status: 'warn', advice: `未經 AI 判斷（${reason}）`, evidence: input.jsonLdTypes.join('、') || '（無 JSON-LD）' },
    { ...EEAT, status: 'warn', advice: `未經 AI 判斷（${reason}）` },
  ];

  if (!apiKey) return fallback('缺少 OPENROUTER_API_KEY');

  let text: string;
  try {
    text = await askOpenRouter(buildPrompt(input), apiKey);
  } catch (err) {
    return fallback(err instanceof Error ? err.message : 'AI 呼叫失敗');
  }

  const parsed = parseAiJson(text);
  if (!parsed) return fallback('AI 回覆無法解析');

  return [
    {
      ...SCHEMA,
      status: normStatus(parsed.schema?.status),
      advice: parsed.schema?.message ?? '（AI 未提供說明）',
      evidence: input.jsonLdTypes.join('、') || '（無 JSON-LD）',
    },
    {
      ...EEAT,
      status: normStatus(parsed.eeat?.status),
      advice: parsed.eeat?.message ?? '（AI 未提供說明）',
    },
  ];
}
