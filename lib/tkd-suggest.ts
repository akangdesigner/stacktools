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
  understanding: string; // AI 對這頁在講什麼／賣什麼的判斷，給人審查用，不寫入 sheet
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

function buildPrompt(p: SuggestInput, relevantKeywords?: string[]): string {
  // 指定關鍵字的相關性已在前一步（classifyRelevantKeywords）判斷完畢，
  // 這裡只負責「怎麼自然寫進去」，不再要求 AI 同時兼顧相關性判斷，減少邏輯負擔、避免各欄位標準不一致
  const extraBlock = relevantKeywords && relevantKeywords.length > 0
    ? `
【已確認與這頁相關的指定關鍵字｜請自然融入】
以下關鍵字已經確認跟這一頁的主體相關，請自然融入四個欄位（不必再判斷相關性，也不要納入下面清單以外的指定關鍵字）：${relevantKeywords.join('、')}
- **title：用「最相關的 1 個」放在前面**，字數還夠可再帶第 2 個。若硬放會讓句子不通順或語意怪，可改用意思相近的說法。
- **description：自然帶入**，語句要通順、像人話，不要為了塞字硬湊。
- **keywords 欄：可列入上面這批關鍵字**，不受前面「3～6 個」上限，但不要多加清單以外的指定關鍵字。
- **h1：包含 title 用到的主關鍵字。**
**通順、像人話永遠優先於硬塞字數**——寧可少放一個關鍵字，也不要寫出不通順的句子。
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
只回傳 JSON，不要任何多餘說明或 markdown。understanding 是給人看的審查欄，用一句話白話說明你判斷這頁「在講什麼／賣什麼」（依上面第一步判斷的頁面性質寫，不是重複 title）：
{"title":"...","description":"...","keywords":"...","h1":"...","understanding":"..."}`;
}

// 判斷指定關鍵字裡，哪些真的跟這一頁的主體相關（獨立一步，邏輯單純，AI 比較不會判斷失準）
function buildRelevancePrompt(p: SuggestInput, candidates: string[]): string {
  return `以下是一個網頁的資料，和一批候選關鍵字。請判斷每個候選關鍵字是否為「這一頁真正在賣／在講的主體」。
門檻要嚴：只有候選字本身就是這頁的主角才算相關；同網站、同品牌、同類別但講的是別的具體對象（例如候選字是某款商品，但這頁是別款商品、分類總覽頁、部落格總覽頁），一律算不相關。

【頁面資料】
頁名：${p.label || ''}
網址：${p.url}
現有標題：${p.title || '(空)'}
頁面內容摘要：${(p.content || '').slice(0, 800) || '(抓不到內容)'}

【候選關鍵字】
${candidates.join('、')}

只回傳 JSON 陣列，只列出判定為相關的關鍵字（原字串，不要改寫），沒有任何相關就回傳空陣列，不要多餘說明：
["..."]`;
}

async function classifyRelevantKeywords(p: SuggestInput, apiKey: string): Promise<string[]> {
  const candidates = (p.extraKeywords || '')
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (candidates.length === 0) return [];
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
      messages: [{ role: 'user', content: buildRelevancePrompt(p, candidates) }],
      max_tokens: 200, // 只回一個小 JSON 陣列，成本很低
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return []; // 判斷失敗就當作沒有相關的，退回原本不塞指定關鍵字的寫法，比硬塞安全
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    return Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
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
      understanding: String(o.understanding ?? '').trim(),
    };
  } catch {
    return null;
  }
}

// 生成單一頁面的建議 TKD
export async function generateSuggestion(p: SuggestInput): Promise<TkdSuggestion> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENROUTER_API_KEY 環境變數');
  // 有指定關鍵字時，先用一次小呼叫判斷跟這頁真正相關的子集，再交給主生成呼叫自然融入
  const relevantKeywords = p.extraKeywords ? await classifyRelevantKeywords(p, apiKey) : undefined;
  const text = await askOpenRouter(buildPrompt(p, relevantKeywords), apiKey);
  const parsed = parseSuggestion(text);
  if (!parsed) throw new Error('AI 回傳格式無法解析');
  return parsed;
}
