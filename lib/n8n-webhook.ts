/** Zeabur / 面板常見：true 帶空白、大小寫、或包引號 */
export function envIsTruthy(raw: string | undefined): boolean {
  if (raw == null) return false;
  const v = raw.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export interface WebhookTarget {
  /** 顯示用名稱（log 與錯誤訊息） */
  label: string;
  url: string | undefined;
  testUrl: string | undefined;
}

/**
 * 打 n8n webhook，沿用既有 fallback 規則：
 * - N8N_WEBHOOK_USE_TEST 開啟時直接打測試網址
 * - 正式網址回 404 時改打測試網址（本機或尚未啟用正式 workflow 時）
 */
export async function postN8nWebhook(
  target: WebhookTarget,
  payload: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const useTest = envIsTruthy(process.env.N8N_WEBHOOK_USE_TEST);

  const primaryUrl = useTest ? target.testUrl : target.url;
  if (!primaryUrl) {
    return {
      ok: false,
      error: useTest
        ? `已開啟測試 Webhook 但未設定 ${target.label} 測試網址`
        : `尚未設定 ${target.label} webhook 網址`,
    };
  }

  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };

  try {
    let response = await fetch(primaryUrl, { method: 'POST', headers, body });

    if (!useTest && response.status === 404 && target.testUrl) {
      response = await fetch(target.testUrl, { method: 'POST', headers, body });
    }

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        error: `${target.label} webhook 呼叫失敗（HTTP ${response.status}）：${errText || '未知錯誤'}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `${target.label} webhook 連線失敗：${String(err)}` };
  }
}
