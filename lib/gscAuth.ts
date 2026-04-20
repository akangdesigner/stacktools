import { getToken } from './gscDb';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function getAccessToken(): Promise<string> {
  const refreshToken = getToken();
  if (!refreshToken) throw new Error('GSC 尚未授權，請先連結 Google 帳號');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`取得 access token 失敗：${data.error ?? res.status}`);
  }

  return data.access_token;
}
