// TKD 背景任務表（記憶體版，跟 recommendation-jobs 同套路）
// 為什麼需要：爬頁＋逐頁 AI 生成會跑好幾分鐘，Zeabur 閘道約 60 秒就斷線回 502，
// 所以改成「立刻回 jobId、背景繼續跑、前端輪詢進度」

export type TkdJobStatus = 'running' | 'completed' | 'failed';

export interface TkdJob {
  id: string;
  status: TkdJobStatus;
  message: string; // 進度說明，例如「AI 生成建議中（12／35 頁）」
  done: number; // 已完成頁數
  total: number; // 總頁數（0 = 還不知道）
  result?: unknown; // 完成後的完整結果（原本 API 直接回的 JSON）
  error?: string; // 失敗原因
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, TkdJob>();

// 任務只是暫存進度用，完成後留 30 分鐘給前端拿結果，之後清掉避免記憶體越積越多
const TTL_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL_MS) jobs.delete(id);
  }
}

export function createTkdJob(message = '任務啟動中…'): TkdJob {
  sweep();
  const now = Date.now();
  const job: TkdJob = {
    id: crypto.randomUUID(),
    status: 'running',
    message,
    done: 0,
    total: 0,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

// 更新進度（訊息＋已完成/總數）
export function progressTkdJob(id: string, message: string, done = 0, total = 0): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, message, done, total, updatedAt: Date.now() });
}

export function completeTkdJob(id: string, result: unknown, message = '完成'): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: 'completed', message, result, updatedAt: Date.now() });
}

export function failTkdJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: 'failed', message: '任務失敗', error, updatedAt: Date.now() });
}

export function getTkdJob(id: string): TkdJob | null {
  return jobs.get(id) ?? null;
}
