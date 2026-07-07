import type { CheckResult } from './site-audit-rules';

// ── 網站技術健檢：背景工作進度存放（module 內 in-memory Map）────────────
// 全站爬取較久，改成背景 job：route 開 job 後立即回 jobId，爬蟲/彙總在背景跑並更新進度，
// 前端輪詢 status API 拿進度與結果。Zeabur 是常駐 Node，背景 async 會持續執行。

export type AuditJobStatus = 'crawling' | 'analyzing' | 'completed' | 'failed';

export interface AuditJob {
  id: string;
  stage: number; // 1 或 2
  url: string;
  status: AuditJobStatus;
  message: string;
  progress: { crawled: number; discovered: number; cap: number };
  result?: CheckResult[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, AuditJob>();
const TTL = 60 * 60 * 1000; // 1 小時後清掉舊 job，避免記憶體累積

// 清掉過期 job
function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > TTL) jobs.delete(id);
  }
}

export function createAuditJob(stage: number, url: string): AuditJob {
  sweep();
  const now = Date.now();
  const id = `sa_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: AuditJob = {
    id,
    stage,
    url,
    status: 'crawling',
    message: '開始爬取網站…',
    progress: { crawled: 0, discovered: 0, cap: 300 },
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return job;
}

export function updateAuditJob(id: string, patch: Partial<Omit<AuditJob, 'id' | 'createdAt'>>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getAuditJob(id: string): AuditJob | undefined {
  return jobs.get(id);
}
