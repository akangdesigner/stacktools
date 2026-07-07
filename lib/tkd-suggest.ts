// 依「頁面實際內容」為主、現有 TKD 為對照，用 Claude 生成建議 TKD
const MODEL = 'anthropic/claude-haiku-4.5';

// 建議生成的輸入（一個頁面的現況＋正文）
export type SuggestInput = {
  url: string;
  label?: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  content?: string;
  extraKeywords?: string; // 使用者指定要納入建議 TKD 的關鍵字（逗號分隔）
  notes?: string; // 微調：使用者的修正指示（改對專有名詞、額外要求等），必須遵守
};

// 建議結果
export type TkdSuggestion = {
  title: string;
  description: string;
  keywords: string;
  h1: string;
};

async function askOpenRouter(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stack.zeabur.app',
      'X-Title': 'Stacktools TKD',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      // 一定要設上限：不設的話 OpenRouter 會用模型上限 64k 當「最壞情況」預扣額度，
      // 餘額不足以預扣時每次請求都直接 402 被拒（建議 TKD 全部留空的元兇）
      max_tokens: 1000,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenRouter 錯誤：${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function buildPrompt(p: SuggestInput): string {
  // 有指定關鍵字時，額外加一段硬性規則
  const extraBlock = p.extraKeywords
    ? `
【使用者指定關鍵字｜最高優先，務必照做】
使用者指定了一批「必用關鍵字」：${p.extraKeywords}
第一步：先從中挑出「跟這一頁主題相關」的（門檻放寬，只要沾得上邊就算相關）。
接著把這些相關的指定關鍵字，依下列**強制規則**融入四個欄位——這是硬性要求，不是建議：
- **title（最重要）：開頭就必須用「最相關的 1 個」指定關鍵字**，字數還夠就再帶第 2 個。title 一定要看得到指定關鍵字，不能只用你自己想的同義詞。
- **description：必須自然帶入「至少 2～3 個」相關的指定關鍵字**，80 字內盡量塞好塞滿，但要通順、像人話。
- **keywords 欄：所有相關的指定關鍵字全部列入**，不受前面「3～6 個」上限。
- **h1：包含 title 用到的主關鍵字。**
【鐵則】只要有任何一個指定關鍵字跟這頁相關，title 和 description 就「絕對不可以」一個都沒用到。請優先確保這些關鍵字實際出現在 t/d 的文字裡（通順為前提，但寧可調整句子也要放進去），不要另外自創一套沒用到指定關鍵字的寫法。
只有「整批指定關鍵字都跟這頁完全無關」時，才可略過、照原本原則寫。
`
    : '';
  // 微調的修正指示：優先權最高，一定要遵守（例如專有名詞的正確寫法）
  const notesBlock = p.notes
    ? `
【最優先：使用者修正指示】以下是使用者的修正要求，優先權高於其他規則，**務必嚴格遵守**：
${p.notes}
（例如：專有名詞的正確寫法、必須改掉的錯字、一定要納入或避免的用詞。若涉及專有名詞，四個欄位都要用正確寫法。）
`
    : '';
  return `你是資深 SEO 顧問。以下是一個網頁的資料，請重新撰寫更好的 SEO 標題(title)、描述(description)、關鍵字(keywords)與主標題(H1)。
${notesBlock}

【第一步：先判斷頁面性質】用「網址＋標題」判斷這頁屬於哪一種，兩者寫法完全不同：
- 總覽／列表／分類頁（首頁、部落格總覽、最新消息、新知、案例列表、商品分類等）：用「整個版塊／網站的主題」來寫 TKD（可從網址片段、標題、品牌推斷）。**絕對不要**拿頁面內容裡出現的某一篇文章／某一項商品的標題來當作這頁的主題。
- 單一內容頁（單篇文章、單一商品/服務/建案）：才以「頁面內容」為主要依據來寫。
- 判斷線索：若「頁面內容摘要」只有一兩句、且明顯是某一篇文章或某一項商品的標題，但網址/標題看起來像版塊名稱（如 insight、news、blog、works、列表、分類），那就是「總覽／列表頁」，別被那一項內容帶著走。

【最重要原則】
- 現有的 TKD 可能寫得很爛，**不要被它綁住**；依上面判斷的頁面性質，決定這頁到底在講什麼、賣什麼。
- 建議內容要貼近「使用者真正會在 Google 搜尋的字詞與意圖」（口語化、實際查詢詞），不要只用品牌自嗨詞。
- 若頁面內容或現有標題有可辨識的品牌名稱，請保留。
- 全部用繁體中文。

【字數規則】
- title：約 30 字以內，主關鍵字放前面，可保留品牌後綴（如「 - 品牌名」）
- description：約 80 字，包含主要關鍵字、有吸引點擊的誘因
- keywords：3~6 個使用者實際會搜尋的詞，用半形逗號分隔
- h1：一句話，包含主關鍵字，簡潔有力
${extraBlock}
【頁面資料】
頁名：${p.label || ''}
網址：${p.url}
現有 title：${p.title || '(空)'}
現有 description：${p.description || '(空)'}
現有 keywords：${p.keywords || '(空)'}
現有 H1：${p.h1 || '(空)'}
頁面內容摘要：
${(p.content || '').slice(0, 1500) || '(抓不到內容)'}

【輸出格式】
只回傳 JSON，不要任何多餘說明或 markdown：
{"title":"...","description":"...","keywords":"...","h1":"..."}`;
}

// 從 AI 回覆中解析出 JSON（容忍 ```json 包裹或前後有雜訊）
function parseSuggestion(text: string): TkdSuggestion | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const kw = Array.isArray(o.keywords) ? o.keywords.join(', ') : String(o.keywords ?? '');
    return {
      title: String(o.title ?? '').trim(),
      description: String(o.description ?? '').trim(),
      keywords: kw.trim(),
      h1: String(o.h1 ?? '').trim(),
    };
  } catch {
    return null;
  }
}

// 生成單一頁面的建議 TKD
export async function generateSuggestion(p: SuggestInput): Promise<TkdSuggestion> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY 環境變數');
  const text = await askOpenRouter(buildPrompt(p), apiKey);
  const parsed = parseSuggestion(text);
  if (!parsed) throw new Error('AI 回傳格式無法解析');
  return parsed;
}
