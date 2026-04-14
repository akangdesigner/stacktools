"use client";

import { useEffect, useState } from "react";
import type { ImageReplacement } from "@/types";

interface Props {
  rawHtml: string;
  replacements: ImageReplacement[];
  onChange: (replacements: ImageReplacement[]) => void;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function isRelativePath(src: string): boolean {
  return !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("//") && !src.startsWith("data:");
}

// Extracts src from every <img> tag — used to detect images in the original pasted HTML
// Skips emoji images (role="img", /emoji/ CDN, or .svg extension)
function parseImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const seen = new Set<string>();
  const imgTagRegex = /<img\s[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = imgTagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];
    const srcMatch = /\bsrc="([^"]+)"/.exec(tag);
    if (!srcMatch || seen.has(srcMatch[1])) continue;
    const src = srcMatch[1];
    const isEmoji = /\brole="img"/.test(tag) || src.includes("/emoji/") || src.endsWith(".svg");
    if (isEmoji) continue;
    seen.add(src);
    srcs.push(src);
  }
  return srcs;
}

// Extracts src from <figure class="image"><img src="..."> blocks — used to parse replacement URLs
function parseFigureSrcs(html: string): string[] {
  const srcs: string[] = [];
  const figureRegex = /<figure\s[^>]*class="image"[^>]*>[\s\S]*?<\/figure>/gi;
  let fig: RegExpExecArray | null;
  while ((fig = figureRegex.exec(html)) !== null) {
    const srcMatch = /\bsrc="([^"]+)"/.exec(fig[0]);
    if (srcMatch) srcs.push(decodeHtmlEntities(srcMatch[1]));
  }
  return srcs;
}

function resolveRelative(src: string, baseUrl: string): string {
  try {
    return new URL(src, new URL(baseUrl)).href;
  } catch {
    return src;
  }
}

export function Step3ImageReplace({ rawHtml, replacements, onChange }: Props) {
  const [bulkText, setBulkText] = useState("");
  const [sourceBaseUrl, setSourceBaseUrl] = useState("");

  const hasRelativeReplacement = replacements.some((r) => r.replacement.trim() && isRelativePath(r.replacement.trim()));

  useEffect(() => {
    const srcs = parseImageSrcs(rawHtml);
    const existingMap = new Map(replacements.map((r) => [r.original, r.replacement]));
    const next: ImageReplacement[] = srcs.map((src) => ({
      original: src,
      replacement: existingMap.get(src) ?? "",
    }));
    const prevOriginals = replacements.map((r) => r.original).join("\0");
    const nextOriginals = next.map((r) => r.original).join("\0");
    if (prevOriginals !== nextOriginals) {
      onChange(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHtml]);

  function handleBaseUrlChange(url: string) {
    setSourceBaseUrl(url);
    if (!url.trim()) return;
    // Auto-resolve relative replacement URLs
    const next = replacements.map((r) => ({
      ...r,
      replacement: r.replacement.trim() && isRelativePath(r.replacement.trim())
        ? resolveRelative(r.replacement.trim(), url.trim())
        : r.replacement,
    }));
    onChange(next);
  }

  function handleBulkChange(text: string) {
    setBulkText(text);
    const extractedUrls = parseFigureSrcs(text);
    const urls = extractedUrls.length > 0
      ? extractedUrls
      : (() => {
          // Extract ALL src="..." globally (handles multiple <img> on the same line)
          const globalSrcs = [...text.matchAll(/\bsrc="([^"]+)"/g)].map((m) => decodeHtmlEntities(m[1]));
          if (globalSrcs.length > 0) return globalSrcs;
          // Fall back: one URL per line
          return text.split("\n").map((l) => l.trim()).filter(Boolean);
        })();
    const next: ImageReplacement[] = replacements.map((r, i) => ({
      ...r,
      replacement: urls[i] ? decodeHtmlEntities(urls[i]) : "",
    }));
    onChange(next);
  }

  if (replacements.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">替換圖片網址</h2>
          <p className="text-sm text-gray-500 mt-1">將草稿站圖片替換為正式圖片網址</p>
        </div>
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-500">
          <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          未偵測到圖片，可直接下一步
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">替換圖片網址</h2>
        <p className="text-sm text-gray-500 mt-1">
          偵測到 {replacements.length} 張圖片，依序貼上新網址（一行一個，留空保留原圖）
        </p>
      </div>

      {/* 相對路徑警告 */}
      {hasRelativeReplacement && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
            </svg>
            偵測到相對路徑圖片
          </p>
          <p className="text-xs text-amber-700">貼入文章來源網址，工具會自動帶入完整圖片網址</p>
          <input
            type="url"
            value={sourceBaseUrl}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
            placeholder="https://example.com/admin/article/detail?id=86"
            className="w-full text-sm px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white placeholder-gray-400"
          />
        </div>
      )}

      {/* Image preview row */}
      <div className="flex gap-2 flex-wrap">
        {replacements.map((item, idx) => (
          <div key={item.original} className="flex flex-col items-center gap-1">
            <div className="w-16 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={decodeHtmlEntities(item.original)}
                alt={`圖片 ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <span className="text-xs text-gray-400">{idx + 1}</span>
          </div>
        ))}
      </div>

      {/* Bulk input */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">
          請至 Shopline 先上傳圖片並貼上文章以獲得圖片原始碼網址（需排列圖片順序），再貼上至此
        </label>
        <textarea
          value={bulkText}
          onChange={(e) => handleBulkChange(e.target.value)}
          rows={6}
          placeholder={`<figure class="image"><img src="圖片1網址" ...></figure>\n<figure class="image"><img src="圖片2網址" ...></figure>`}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400 font-mono resize-none"
        />
      </div>

      {/* Match status */}
      <div className="flex gap-2 flex-wrap">
        {replacements.map((item, idx) => (
          <span
            key={item.original}
            className={`text-xs px-2 py-0.5 rounded-full ${item.replacement.trim() ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}
          >
            圖片 {idx + 1} {item.replacement.trim() ? "✓" : "保留原圖"}
          </span>
        ))}
      </div>
    </div>
  );
}
