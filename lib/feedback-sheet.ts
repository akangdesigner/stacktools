import { google } from 'googleapis';

const DEFAULT_SHEET_ID = '1adrGAZSynaJ12-XZM3gCLFMTuBpCKbef_LIRR36H9MI';
const DEFAULT_RANGE = '工具箱回饋!A:C';

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error('尚未設定 GOOGLE_SERVICE_ACCOUNT_JSON');
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤');
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export async function appendFeedbackRow(category: string, content: string) {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.FEEDBACK_SHEET_ID?.trim() || DEFAULT_SHEET_ID;
  const range = process.env.FEEDBACK_SHEET_RANGE?.trim() || DEFAULT_RANGE;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[formatDate(new Date()), category, content]],
    },
  });
}
