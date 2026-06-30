import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 上傳上限放寬到 200MB（抽音軌前的原始檔）；Whisper 本身單檔上限 25MB（抽完音軌後才送）
const MAX_UPLOAD = 200 * 1024 * 1024;
const WHISPER_LIMIT = 25 * 1024 * 1024;

// 用 ffmpeg 把影片/音檔抽成 16kHz 單聲道 mp3（語音轉錄只需這樣，檔案大幅縮小）
async function extractAudio(input: Buffer, srcExt: string): Promise<Buffer> {
  const bin = ffmpegPath as unknown as string | null;
  if (!bin) throw new Error('伺服器找不到 ffmpeg 執行檔路徑');
  // 確認 binary 真的存在且可執行（Next 打包可能改寫路徑，先擋掉）
  try {
    await access(bin, fsConstants.X_OK);
  } catch {
    throw new Error(`ffmpeg 執行檔不存在或不可執行：${bin}`);
  }

  const stamp = Math.random().toString(36).slice(2);
  const inPath = join(tmpdir(), `vi-${stamp}.${srcExt || 'tmp'}`);
  const outPath = join(tmpdir(), `vi-${stamp}.mp3`);
  const cleanup = async () => {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  };

  await writeFile(inPath, input);

  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(bin, [
        '-i', inPath,
        '-vn',                    // 去掉視訊軌
        '-ac', '1',               // 單聲道
        '-ar', '16000',           // 16kHz（Whisper 採樣率）
        '-b:a', '32k',            // 語音用 32kbps 已足夠，一小時約 14MB
        '-f', 'mp3', '-y', outPath,
      ]);
      let errLog = '';
      ff.stderr.on('data', d => { errLog += d.toString(); });
      ff.on('error', err => reject(new Error(`無法啟動 ffmpeg：${err.message}`)));
      ff.on('close', code => {
        if (code === 0) { resolve(); return; }
        // 帶上 exit code 與完整 stderr 尾段，方便診斷
        const tail = errLog.trim().slice(-800) || '（ffmpeg 沒有輸出錯誤訊息）';
        reject(new Error(`ffmpeg 退出碼 ${code}：${tail}`));
      });
    });
    return await readFile(outPath);
  } finally {
    await cleanup();
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
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

  if (audio.length > WHISPER_LIMIT) {
    const mb = (audio.length / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `音軌壓縮後仍有 ${mb}MB（影片過長），請裁成較短片段後再試` },
      { status: 400 },
    );
  }

  const groq = new Groq({ apiKey });
  try {
    // 用抽出的 mp3 音軌轉錄，指定中文以提升正體中文準確度
    const audioFile = new File([new Uint8Array(audio)], 'audio.mp3', { type: 'audio/mpeg' });
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'zh',
    });

    const transcript = (transcription.text ?? '').trim();
    if (!transcript) {
      return NextResponse.json({ error: '轉錄結果為空，請確認檔案是否含有語音內容' }, { status: 400 });
    }

    return NextResponse.json({ filename: file.name, transcript });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `轉錄失敗：${msg}` }, { status: 502 });
  }
}
