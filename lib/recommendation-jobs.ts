export type RecommendationJobStatus = "processing" | "completed" | "failed";

export interface RecommendationJob {
  id: string;
  status: RecommendationJobStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, RecommendationJob>();

export function createRecommendationJob(id: string, message = "需求已送出，文章生成中"): RecommendationJob {
  const now = Date.now();
  const job: RecommendationJob = {
    id,
    status: "processing",
    message,
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

export function getRecommendationJob(id: string): RecommendationJob | null {
  return jobs.get(id) ?? null;
}
