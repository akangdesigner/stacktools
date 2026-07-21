// 社群海巡的掃描任務表。
// n8n 掃 Threads＋FB＋逐篇評分＋生留言實測 5~10 分鐘，超過 Node fetch 內建的 300 秒
// headers timeout，所以不能讓 App 同步等 n8n 回應（會拿到 TypeError: fetch failed）。
// 改成：App 送出後立刻放手 → n8n 跑完打 /api/liff-social-monitor/callback 寫回結果 →
// 前端輪詢 GET 拿結果。generate 與 callback 兩支 route 共用這張表。

export type Job = {
  status: 'pending' | 'done' | 'error';
  items?: unknown[];
  customerName?: string;
  error?: string;
  ts: number;
};

// 模組層 job 表；Zeabur 常駐 Node process 跨請求存活（process 重啟會清空，可接受）
const g = globalThis as unknown as { __socialMonitorJobs?: Map<string, Job> };
const jobs: Map<string, Job> = (g.__socialMonitorJobs ??= new Map());

// 清掉 20 分鐘前的舊任務（前端最多等 12 分鐘，留足餘裕）
export function pruneJobs() {
  const now = Date.now();
  for (const [k, v] of jobs) if (now - v.ts > 20 * 60 * 1000) jobs.delete(k);
}

export function createJob(jobId: string) {
  jobs.set(jobId, { status: 'pending', ts: Date.now() });
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function deleteJob(jobId: string) {
  jobs.delete(jobId);
}

// 掃描完成：寫回結果。找不到 job（已逾時被清掉／process 重啟）回 false
export function finishJob(jobId: string, items: unknown[], customerName: string): boolean {
  if (!jobs.has(jobId)) return false;
  jobs.set(jobId, { status: 'done', items, customerName, ts: Date.now() });
  return true;
}

// 掃描失敗：寫回錯誤訊息
export function failJob(jobId: string, error: string): boolean {
  if (!jobs.has(jobId)) return false;
  jobs.set(jobId, { status: 'error', error, ts: Date.now() });
  return true;
}
