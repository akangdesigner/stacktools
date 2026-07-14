const N8N_BASE = 'https://n8n.dg166.com/webhook';

export interface NeonClient {
  channel_id: string;
  channel_name: string;
  case_start_date: string | null;
  tax_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface NeonContract {
  id: string;
  channel_id: string;
  channel_name: string;
  case_start_date: string;
  base_date: string | null;
  contract_end_date: string;
}

async function callWebhook<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${N8N_BASE}/${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`n8n webhook 呼叫失敗 (${res.status}): ${body}`);
  }
  return res.json();
}

// 沿用 monthly-plan-api 已驗證可用的 Postgres 憑證，不需要額外 Neon 金鑰
export async function initNeonClients(): Promise<void> {
  // clients 資料表由 n8n 端各 webhook 自行確保存在，這裡不需要動作
}

export async function listNeonClients(): Promise<NeonClient[]> {
  return callWebhook<NeonClient[]>('finance-clients-list');
}

export async function getNeonClient(channel_id: string): Promise<NeonClient | null> {
  const rows = await callWebhook<{ client: NeonClient | null }[]>(
    `finance-clients-get?channel_id=${encodeURIComponent(channel_id)}`
  );
  return rows[0]?.client ?? null;
}

export async function upsertNeonClient(
  channel_id: string,
  input: Partial<Pick<NeonClient, 'tax_id' | 'contact_name' | 'contact_email' | 'contact_phone' | 'notes'>>
): Promise<NeonClient> {
  const rows = await callWebhook<NeonClient[]>('finance-clients-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id,
      tax_id: input.tax_id ?? null,
      contact_name: input.contact_name ?? null,
      contact_email: input.contact_email ?? null,
      contact_phone: input.contact_phone ?? null,
      notes: input.notes ?? null,
    }),
  });
  return rows[0];
}

export async function deleteNeonClient(channel_id: string): Promise<void> {
  await callWebhook(`finance-clients-delete?channel_id=${encodeURIComponent(channel_id)}`, {
    method: 'DELETE',
  });
}

export async function getContractsByChannelId(channel_id: string): Promise<NeonContract[]> {
  const rows = await callWebhook<{ contracts: NeonContract[] | null }[]>(
    `finance-clients-get?channel_id=${encodeURIComponent(channel_id)}`
  );
  return rows[0]?.contracts ?? [];
}
