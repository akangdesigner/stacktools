import { NextRequest, NextResponse } from 'next/server';
import { extractAudio, transcribeAudio } from '@/lib/transcribeAudio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 上傳上限放寬到 200MB（抽音軌前的原始檔）；Whisper 本身單檔上限 25MB（抽完音軌後才送）
const MAX_UPLOAD = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: '伺服器尚未設定 GROQ_API_KEY 環境變數' }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳影音檔案' }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `檔案 ${mb}MB 超過 200MB 上限，請先裁切或壓縮後再試` },
      { status: 400 },
    );
  }

  // 先抽音軌+壓縮，讓影片/大音檔都能塞進 Whisper 的 25MB 限制
  const srcBuf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let audio: Buffer;
  try {
    audio = await extractAudio(srcBuf, ext);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `音軌處理失敗：${msg}` }, { status: 502 });
  }

  try {
    const transcript = await transcribeAudio(audio);
    return NextResponse.json({ filename: file.name, transcript });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `轉錄失敗：${msg}` }, { status: 502 });
  }
}
