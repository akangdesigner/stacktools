export type AiEditorJobStatus = 'processing' | 'completed' | 'failed';

export interface AiEditorJob {
  id: string;
  status: AiEditorJobStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
  result?: {
    draftText?: string;
    draftImageUrl?: string;
    raw?: unknown;
  };
}

const jobs = new Map<string, AiEditorJob>();

export function createAiEditorJob(
  id: string,
  message = '需求已送出，等待 n8n 回應'
): AiEditorJob {
  const now = Date.now();
  const job: AiEditorJob = {
    id,
    status: 'processing',
    message,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

export function updateAiEditorJob(
  id: string,
  status: AiEditorJobStatus,
  message: string,
  result?: AiEditorJob['result']
): AiEditorJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;
  const next: AiEditorJob = {
    ...prev,
    status,
    message,
    updatedAt: Date.now(),
    result: result ?? prev.result,
  };
  jobs.set(id, next);
  return next;
}

export function getAiEditorJob(id: string): AiEditorJob | null {
  return jobs.get(id) ?? null;
}
