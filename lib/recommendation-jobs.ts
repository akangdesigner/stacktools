import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export type RecommendationJobStatus =
  | "researching"
  | "awaiting_confirm"
  | "researching_details"
  | "generating"
  | "completed"
  | "failed";

export type RecommendationStage = "brands" | "outline" | "brand_details" | "final";

export interface RecommendationBrand {
  brand_name: string;
  official_url: string;
}

export interface RecommendationBrandDetail {
  brand_name: string;
  brand_background: string;
  brand_positioning: string;
  media_coverage: string;
  awards_certifications: string;
  market_features: string;
  pros: string;
  cons: string;
  user_experience: string;
  discussion_points: string;
  repurchase_intent: string;
  reference_links: string;
}

export interface RecommendationJobInput {
  title: string;
  keywords: string;
  searchTerm: string;
  requiredBrand: string;
  introLink: string;
}

export interface RecommendationJobData {
  brands?: RecommendationBrand[];
  outline?: string;
  titleSuggestions?: string[];
  references?: string;
  brandDetails?: RecommendationBrandDetail[];
  confirmedTitle?: string;
  wpLink?: string;
  wpEditLink?: string;
}

export interface RecommendationJob {
  id: string;
  status: RecommendationJobStatus;
  message: string;
  input: RecommendationJobInput;
  data: RecommendationJobData;
  createdAt: number;
  updatedAt: number;
}

// job 狀態改存 SQLite（跟 tkd.db／site-audit.db 同一套 data/ 掛載模式）
// 原本存在記憶體的 Map，只要一部署（不管誰推什麼上去）就會把進行中的任務砍掉，
// n8n callback 打回來找不到任務變永久卡死，8/14 當天至少撞了 3 次。
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "recommendation.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS recommendation_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    input TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

interface JobRow {
  id: string;
  status: RecommendationJobStatus;
  message: string;
  input: string;
  data: string;
  created_at: number;
  updated_at: number;
}

function toJob(row: JobRow): RecommendationJob {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    input: JSON.parse(row.input) as RecommendationJobInput,
    data: JSON.parse(row.data) as RecommendationJobData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readJob(id: string): RecommendationJob | null {
  const row = db.prepare("SELECT * FROM recommendation_jobs WHERE id = ?").get(id) as
    | JobRow
    | undefined;
  return row ? toJob(row) : null;
}

export function createRecommendationJob(
  id: string,
  input: RecommendationJobInput,
  message = "正在查詢品牌與生成大綱"
): RecommendationJob {
  const now = Date.now();
  db.prepare(
    `INSERT INTO recommendation_jobs (id, status, message, input, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, "researching", message, JSON.stringify(input), "{}", now, now);
  return readJob(id) as RecommendationJob;
}

export function updateRecommendationJob(
  id: string,
  status: RecommendationJobStatus,
  message: string
): RecommendationJob | null {
  const prev = readJob(id);
  if (!prev) return null;
  const now = Date.now();
  db.prepare(
    `UPDATE recommendation_jobs SET status = ?, message = ?, updated_at = ? WHERE id = ?`
  ).run(status, message, now, id);
  return readJob(id);
}

// 接收某一階段的回傳資料；品牌與大綱到齊時自動轉為待確認（品牌深度研究改成使用者確認後才另外觸發，不擋這裡）
export function applyStageResult(
  id: string,
  stage: RecommendationStage,
  data: RecommendationJobData,
  message?: string
): RecommendationJob | null {
  const prev = readJob(id);
  if (!prev) return null;

  const mergedData: RecommendationJobData = { ...prev.data, ...data };
  let status = prev.status;
  let nextMessage = message ?? prev.message;

  if (stage === "final") {
    status = "completed";
    nextMessage = message ?? "文章已生成完成";
  } else if (
    prev.status === "researching" &&
    mergedData.brands &&
    mergedData.outline !== undefined &&
    mergedData.titleSuggestions !== undefined
  ) {
    status = "awaiting_confirm";
    nextMessage = message ?? "品牌與大綱已就緒，請確認後開始生成";
  }

  const now = Date.now();
  db.prepare(
    `UPDATE recommendation_jobs SET status = ?, message = ?, data = ?, updated_at = ? WHERE id = ?`
  ).run(status, nextMessage, JSON.stringify(mergedData), now, id);
  return readJob(id);
}

// 使用者在確認畫面按下確認：把編輯後的品牌／大綱／標題存回 job，並轉去跑品牌深度研究
export function confirmBrandsAndStartDetailResearch(
  id: string,
  brands: RecommendationBrand[],
  outline: string,
  confirmedTitle: string
): RecommendationJob | null {
  const prev = readJob(id);
  if (!prev) return null;

  const mergedData: RecommendationJobData = { ...prev.data, brands, outline, confirmedTitle };
  const now = Date.now();
  db.prepare(
    `UPDATE recommendation_jobs SET status = ?, message = ?, data = ?, updated_at = ? WHERE id = ?`
  ).run("researching_details", "正在研究品牌細節（約 1～3 分鐘）", JSON.stringify(mergedData), now, id);
  return readJob(id);
}

export function getRecommendationJob(id: string): RecommendationJob | null {
  return readJob(id);
}
