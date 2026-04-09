import { NextRequest, NextResponse } from 'next/server';

// Translate a single chunk via MyMemory (free, no key needed)
async function translateChunk(text: string): Promise<string> {
  if (!text.trim()) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-TW`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.responseData?.translatedText ?? text;
}

// Split plain text into chunks ≤ 450 chars, breaking at sentences
function chunkText(text: string, maxLen = 450): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('. ', maxLen);
    if (cut < 100) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut < 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function translateText(text: string): Promise<string> {
  if (text.length <= 450) return translateChunk(text);
  const chunks = chunkText(text);
  const results = await Promise.all(chunks.map(translateChunk));
  return results.join(' ');
}

// Split HTML into alternating text/tag segments, translate only text parts
async function translateHtml(html: string): Promise<string> {
  // Split into [text, tag, text, tag, ...]
  const segments = html.split(/(<[^>]+>)/);

  // Collect indices and values of text segments that need translation
  const textIndices: number[] = [];
  const textsToTranslate: string[] = [];

  segments.forEach((seg, i) => {
    const isTag = i % 2 === 1;
    if (!isTag && seg.trim()) {
      textIndices.push(i);
      textsToTranslate.push(seg);
    }
  });

  const translated = await Promise.all(textsToTranslate.map(translateText));

  textIndices.forEach((idx, j) => {
    segments[idx] = translated[j];
  });

  return segments.join('');
}

export async function POST(req: NextRequest) {
  try {
    const { title, content } = await req.json();

    const [translatedTitle, translatedContent] = await Promise.all([
      translateText(title ?? ''),
      translateHtml(content ?? ''),
    ]);

    return NextResponse.json({
      title: translatedTitle,
      content: translatedContent,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
