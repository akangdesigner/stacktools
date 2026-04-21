const APPS_SCRIPT_URL =
  process.env.FEEDBACK_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbxyhfuMyWkd-KZ5Qrhc432XZUYiksSybZHDZLYqvvU35aElwMbuyndRrWC0Sv_26dqlMw/exec';

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export async function appendFeedbackRow(category: string, content: string) {
  const params = new URLSearchParams({
    date: formatDate(new Date()),
    category,
    content,
  });

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: params,
  });

  if (!res.ok) {
    throw new Error(`Apps Script 回應異常：HTTP ${res.status}`);
  }
}
