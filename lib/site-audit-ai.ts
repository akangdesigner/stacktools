import { LEVEL, CATEGORY } from './site-audit-rules';
import type { CheckResult, CheckStatus } from './site-audit-rules';

// ── 網站技術健檢：AI 補語意層 ───────────────────────────
// 規則層判不了的語意題交給 Claude（走 OpenRouter，與 TKD 工具同一套）：
//   E-E-A-T 權威訊號足不足
// Schema 完整度已改成純規則判斷（見 lib/site-audit-schema.ts），不再交給 AI 猜。
// 沒設 API key 或呼叫失敗時，回退成 warn（標「AI 未判斷」），不讓整個健檢炸掉。

const MODEL = 'anthropic/claude-haiku-4.5';

export type EeatInput = {
  url: string;
  mainText: string; // 頁面主要文字（已截斷）
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
      max_tokens: 500,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(input: EeatInput): string {
  return `你是資深 SEO 技術顧問。以下是一個網頁的內文摘要，請判斷 E-E-A-T 權威訊號足不足，給一個狀態與一句中文說明。

【頁面網址】${input.url}

【頁面內文摘要】
${input.mainText || '（抓不到內文）'}

請檢查內文是否有作者資訊、專業證照、獲獎紀錄、媒體報導、真實客戶評論、關於我們等信任訊號。幾乎沒有→"fail"；有一些但薄弱→"warn"；充足→"ok"。

只回傳 JSON，格式如下（message 用繁體中文、一句話、具體指出依據）：
{"status":"ok|warn|fail","message":"..."}`;
}

// 從 AI 回覆中容錯解析出 JSON（可能被 ```json 包住或夾雜前後文字）
function parseAiJson(text: string): { status?: string; message?: string } | null {
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

// AI 層總入口：回傳 E-E-A-T 的 CheckResult
export async function runEeatCheck(input: EeatInput): Promise<CheckResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const EEAT = { key: 'eeat', level: LEVEL.EFFICIENCY, category: CATEGORY.EXTERNAL, item: '符合 E-E-A-T 原則' };

  if (!apiKey) return { ...EEAT, status: 'warn', advice: '未經 AI 判斷（缺少 OPENROUTER_API_KEY）' };

  let text: string;
  try {
    text = await askOpenRouter(buildPrompt(input), apiKey);
  } catch (err) {
    return { ...EEAT, status: 'warn', advice: `未經 AI 判斷（${err instanceof Error ? err.message : 'AI 呼叫失敗'}）` };
  }

  const parsed = parseAiJson(text);
  if (!parsed) return { ...EEAT, status: 'warn', advice: '未經 AI 判斷（AI 回覆無法解析）' };

  return { ...EEAT, status: normStatus(parsed.status), advice: parsed.message ?? '（AI 未提供說明）' };
}
