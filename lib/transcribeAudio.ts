import Groq from 'groq-sdk';
import { spawn } from 'node:child_process';
import { writeFile, readFile, unlink, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

// 共用給 app/api/writer/transcribe 與 app/api/liff-videopost/generate：
// 用 ffmpeg 把影片/音檔抽成 16kHz 單聲道 mp3 再送 Groq Whisper 轉錄。
export const WHISPER_LIMIT = 25 * 1024 * 1024;

// 用 ffmpeg 把影片/音檔抽成 16kHz 單聲道 mp3（語音轉錄只需這樣，檔案大幅縮小）
export async function extractAudio(input: Buffer, srcExt: string): Promise<Buffer> {
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

// 用抽出的 mp3 音軌轉錄，指定中文以提升正體中文準確度
export async function transcribeAudio(audio: Buffer): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('伺服器尚未設定 GROQ_API_KEY 環境變數');
  if (audio.length > WHISPER_LIMIT) {
    const mb = (audio.length / 1024 / 1024).toFixed(1);
    throw new Error(`音軌壓縮後仍有 ${mb}MB（影片過長），請裁成較短片段後再試`);
  }

  const groq = new Groq({ apiKey });
  const audioFile = new File([new Uint8Array(audio)], 'audio.mp3', { type: 'audio/mpeg' });
  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3',
    language: 'zh',
  });

  const transcript = (transcription.text ?? '').trim();
  if (!transcript) throw new Error('轉錄結果為空，請確認檔案是否含有語音內容');
  return transcript;
}
