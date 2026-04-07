import { NextRequest, NextResponse } from "next/server";
import { cleanHtml } from "@/lib/html-cleaner";
import type { CleanHtmlRequest } from "@/types";

const MAX_HTML_SIZE = 500 * 1024; // 500KB

export async function POST(req: NextRequest) {
  let body: CleanHtmlRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON 格式" }, { status: 400 });
  }

  const { html, client, articleUrl } = body;

  if (!html || typeof html !== "string") {
    return NextResponse.json({ error: "html 欄位不能為空" }, { status: 400 });
  }

  if (html.length > MAX_HTML_SIZE) {
    return NextResponse.json({ error: "HTML 內容超過 500KB 限制" }, { status: 400 });
  }

  if (!client || typeof client !== "object" || !client.id) {
    return NextResponse.json({ error: "client 資料無效" }, { status: 400 });
  }

  try {
    const cleanedHtml = cleanHtml(html, client, articleUrl);
    return NextResponse.json({ cleanedHtml });
  } catch (err) {
    console.error("HTML 清洗失敗:", err);
    return NextResponse.json({ error: "HTML 清洗時發生錯誤" }, { status: 500 });
  }
}
