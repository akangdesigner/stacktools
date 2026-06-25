export type RecommendationJobStatus =
  | "researching"
  | "awaiting_confirm"
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
  references?: string;
  brandDetails?: RecommendationBrandDetail[];
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

const jobs = new Map<string, RecommendationJob>();

export function createRecommendationJob(
  id: string,
  input: RecommendationJobInput,
  message = "正在查詢品牌與生成大綱"
): RecommendationJob {
  const now = Date.now();
  const job: RecommendationJob = {
    id,
    status: "researching",
    message,
    input,
    data: {},
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

export function updateRecommendationJob(
  id: string,
  status: RecommendationJobStatus,
  message: string
): RecommendationJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;
  const next: RecommendationJob = {
    ...prev,
    status,
    message,
    updatedAt: Date.now(),
  };
  jobs.set(id, next);
  return next;
}

// 接收某一階段的回傳資料；品牌與大綱兩者都到齊時自動轉為待確認
export function applyStageResult(
  id: string,
  stage: RecommendationStage,
  data: RecommendationJobData,
  message?: string
): RecommendationJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;

  const mergedData: RecommendationJobData = { ...prev.data, ...data };
  let status = prev.status;
  let nextMessage = message ?? prev.message;

  if (stage === "final") {
    status = "completed";
    nextMessage = message ?? "文章已生成完成";
  } else if (mergedData.brands && mergedData.outline !== undefined) {
    status = "awaiting_confirm";
    nextMessage = message ?? "品牌與大綱已就緒，請確認後開始生成";
  }

  const next: RecommendationJob = {
    ...prev,
    status,
    message: nextMessage,
    data: mergedData,
    updatedAt: Date.now(),
  };
  jobs.set(id, next);
  return next;
}

export function getRecommendationJob(id: string): RecommendationJob | null {
  return jobs.get(id) ?? null;
}
