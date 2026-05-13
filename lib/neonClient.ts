const PROJECT_ID = process.env.NEON_PROJECT_ID!;
const BRANCH_ID = process.env.NEON_BRANCH_ID!;
const API_KEY = process.env.NEON_API_KEY!;

const QUERY_URL = `https://console.neon.tech/api/v2/projects/${PROJECT_ID}/query`;

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

function sqlEscape(val: string | number | null): string {
  if (val === null) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function sql<T>(query: string, params: (string | number | null)[] = []): Promise<T[]> {
  // Neon Management API does not support $1 parameterized queries —
  // inline params with proper escaping instead.
  const inlined = params.reduce<string>(
    (q, val, i) => q.replace(new RegExp(`\\$${i + 1}(?!\\d)`, 'g'), sqlEscape(val)),
    query
  );

  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query: inlined, branch_id: BRANCH_ID, db_name: 'neondb', role_name: 'neondb_owner' }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Neon SQL] HTTP ${res.status}`, body);
    throw new Error(`Neon query failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  if (data.success === false) {
    const errMsg = data.response?.[0]?.error ?? 'Neon query error';
    console.error('[Neon SQL] Query error:', errMsg);
    throw new Error(errMsg);
  }

  const response = data.response?.[0]?.data;
  if (!response?.rows?.length) return [];
  const { fields, rows } = response as { fields: string[]; rows: unknown[][] };
  return rows.map(row => {
    const obj: Record<string, unknown> = {};
    fields.forEach((f, i) => { obj[f] = row[i]; });
    return obj as T;
  });
}

let clientsTableReady = false;

export async function initNeonClients(): Promise<void> {
  if (clientsTableReady) return;
  await sql(
    `CREATE TABLE IF NOT EXISTS clients (
      channel_id    TEXT PRIMARY KEY,
      tax_id        TEXT,
      contact_name  TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now()
    )`
  );
  clientsTableReady = true;
}

export async function listNeonClients(): Promise<NeonClient[]> {
  return sql<NeonClient>(
    `SELECT DISTINCT ON (c.channel_id)
       c.channel_id, c.channel_name, c.case_start_date,
       cl.tax_id, cl.contact_name, cl.contact_email,
       cl.contact_phone, cl.notes, cl.created_at, cl.updated_at
     FROM contracts c
     LEFT JOIN clients cl ON cl.channel_id = c.channel_id
     ORDER BY c.channel_id, c.case_start_date DESC`
  );
}

export async function getNeonClient(channel_id: string): Promise<NeonClient | null> {
  const rows = await sql<NeonClient>(
    `SELECT c.channel_id, c.channel_name,
       cl.tax_id, cl.contact_name, cl.contact_email,
       cl.contact_phone, cl.notes, cl.created_at, cl.updated_at
     FROM (SELECT DISTINCT channel_id, channel_name FROM contracts
           WHERE channel_id = $1 LIMIT 1) c
     LEFT JOIN clients cl ON cl.channel_id = c.channel_id`,
    [channel_id]
  );
  return rows[0] ?? null;
}

export async function upsertNeonClient(
  channel_id: string,
  input: Partial<Pick<NeonClient, 'tax_id' | 'contact_name' | 'contact_email' | 'contact_phone' | 'notes'>>
): Promise<NeonClient> {
  await sql(
    `INSERT INTO clients (channel_id, tax_id, contact_name, contact_email, contact_phone, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (channel_id) DO UPDATE SET
       tax_id        = EXCLUDED.tax_id,
       contact_name  = EXCLUDED.contact_name,
       contact_email = EXCLUDED.contact_email,
       contact_phone = EXCLUDED.contact_phone,
       notes         = EXCLUDED.notes,
       updated_at    = now()`,
    [
      channel_id,
      input.tax_id ?? null,
      input.contact_name ?? null,
      input.contact_email ?? null,
      input.contact_phone ?? null,
      input.notes ?? null,
    ]
  );
  const result = await getNeonClient(channel_id);
  return result!;
}

export async function deleteNeonClient(channel_id: string): Promise<void> {
  await sql('DELETE FROM clients WHERE channel_id = $1', [channel_id]);
}

export interface NeonContract {
  id: string;
  channel_id: string;
  channel_name: string;
  case_start_date: string;
  base_date: string | null;
  contract_end_date: string;
}

export async function getContractsByChannelId(channel_id: string): Promise<NeonContract[]> {
  return sql<NeonContract>(
    `SELECT id, channel_id, channel_name, case_start_date, base_date, contract_end_date
     FROM contracts WHERE channel_id = $1 ORDER BY case_start_date DESC`,
    [channel_id]
  );
}
