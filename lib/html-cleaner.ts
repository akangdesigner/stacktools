import { parse, HTMLElement as NHTMLElement } from "node-html-parser";
import type { ClientProfile } from "@/types";

function parseStyleString(style: string): Map<string, string> {
  const map = new Map<string, string>();
  style.split(";").forEach((part) => {
    const idx = part.indexOf(":");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (key) map.set(key, val);
  });
  return map;
}

function serializeStyleMap(map: Map<string, string>): string {
  const parts: string[] = [];
  map.forEach((val, key) => parts.push(`${key}: ${val}`));
  return parts.join("; ");
}

function mergeStyles(existing: string, overrides: Record<string, string>): string {
  const map = parseStyleString(existing);
  for (const [key, value] of Object.entries(overrides)) {
    map.set(key, value);
  }
  return serializeStyleMap(map);
}


function hexToRgba(color: string, opacityPercent: number): string {
  const match = color.trim().match(/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/);
  if (!match) return color;
  const raw = match[1];
  const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function generateTocHtml(items: { id: string; text: string }[], linkColor: string, tocTitle: string, tocBgColor: string, tocBgOpacity: number, fontSize: string, articleUrl?: string): string {
  const base = articleUrl ? articleUrl.replace(/#.*$/, "") : ".";
  const links = items
    .map((item) => `<li><a href="${base}#${item.id}" target="_self" style="color: ${linkColor}; text-decoration: underline; font-weight: 400; font-size: ${fontSize};">${item.text}</a></li>`)
    .join("");
  const bgStyle = tocBgColor ? `background-color: ${hexToRgba(tocBgColor, tocBgOpacity)}; ` : "background-color: transparent; ";
  return `<div class="catalog-box" style="${bgStyle}padding: 20px; border-radius: 10px; margin-bottom: 30px;"><p style="font-size: ${fontSize}; font-weight: bold; color: #333333; margin-bottom: 15px;">${tocTitle}</p><ul style="list-style-type: decimal; padding-left: 20px; line-height: 1.8;">${links}</ul></div>`;
}

// m2 專屬：目錄樣式（紅框 .toc，對應 M2_STYLE_BLOCK 裡的 class）
function generateM2TocHtml(items: { id: string; text: string }[]): string {
  const links = items.map((item) => `<li><a href="#${item.id}">${item.text}</a></li>`).join("");
  return `<div class="toc"><h3>📋 本文目錄</h3><ol>${links}</ol></div>`;
}

// m2 專屬：整段內嵌 <style>，複製自客戶網站實際文章頁的樣式表（91APP 平台），
// 讓貼進後台的內容自帶樣式，不用逐一 inline
const M2_STYLE_BLOCK = `<style>
/* 91APP 文章頁外層容器修正：避免文章被外層寬度或留白推到右側 */
#article_content,
.article-content,
.article-detail,
.article-container,
main {
  width: 100% !important;
  max-width: 100% !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

/* 目錄 */
.toc {
  background: #fff5f5;
  border: 2px solid #e00202;
  padding: 15px 20px;
  border-radius: 5px;
  margin: 20px 0;
}
.toc h3 {
  margin: 0 0 .5em 0;
  font-size: 1.15em;
  color: #e00202;
  font-weight: 900;
}
.toc ol { padding-left: 1.4em; margin: 0; }
.toc li { margin: .3em 0; list-style-type: decimal; }
.toc a {
  color: #e00202;
  text-decoration: none;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s ease;
}
.toc a:hover { background-color: #e00202; color: #fff; }

/* H2 章節標題 */
h2.section-title {
  background-color: #e00202 !important;
  color: #fff !important;
  border-bottom: 4px solid #ff4444;
  padding: 12px 15px;
  border-radius: 5px 5px 0 0;
  display: block;
  font-size: 1.3em;
  font-weight: bold;
  margin-top: 2em;
  margin-bottom: .8em;
}
h2.section-title::before { content: "✓ "; font-weight: bold; margin-right: 4px; }
h2.section-title *, h2.section-title strong { color: #fff !important; }

/* H3 小標 */
h3.sub-title {
  color: #e00202 !important;
  font-size: 1.1em;
  font-weight: 800;
  margin: 1.5em 0 .5em 0;
  padding-left: 10px;
  border-left: 4px solid #e00202;
}

/* 強調文字 */
strong { color: #e00202; }
h2.section-title strong { color: #fff !important; }

/* 表格：陽春但好讀，字級 18px、表頭加粗、儲存格留白足夠 */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
}
th, td {
  font-size: 18px !important;
  padding: 12px 16px !important;
  border: 1px solid #e5e5e5;
  text-align: left;
  vertical-align: top;
}
th {
  font-weight: 700 !important;
}

/* FAQ 手風琴 */
details {
  border: 1px solid #f0d0d0;
  border-radius: 5px;
  margin-bottom: .8em;
  overflow: hidden;
}
details summary {
  background: #fff5f5;
  color: #e00202;
  padding: 12px 15px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1em;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
details summary::after { content: "▶"; font-size: .8em; transition: transform 0.25s; color: #e00202; }
details[open] summary::after { transform: rotate(90deg); }
details summary::-webkit-details-marker { display: none; }
.answer { padding: 14px 16px; background: #fff; line-height: 1.8; }
.answer p { margin-bottom: .6em; }

/* CTA 按鈕 */
.cta-wrap { text-align: center; margin: 1.5em 0; }
.cta-button {
  display: inline-block;
  background: #e00202;
  color: white !important;
  text-decoration: none;
  padding: 13px 28px;
  border-radius: 30px;
  font-size: 15px;
  font-weight: bold;
  transition: all 0.3s ease;
  box-shadow: 0 3px 10px rgba(224, 2, 2, 0.3);
}
.cta-button:hover { background: #c00101; transform: translateY(-2px); box-shadow: 0 4px 15px rgba(224, 2, 2, 0.4); }

/* 提醒框 */
.tip-box {
  background: #fff5f5;
  border-left: 4px solid #e00202;
  padding: 12px 16px;
  border-radius: 0 5px 5px 0;
  margin: 1em 0;
  font-size: .97em;
}
</style>
`;

export function cleanHtml(rawHtml: string, client: ClientProfile, articleUrl?: string): string {
  const root = parse(rawHtml);

  // m2 客戶特化樣式（紅底 H2 banner／左框線 H3／紅底表格標題），寫死不開放調整，只認客戶名稱＝m2
  const isM2 = client.name.trim().toLowerCase() === "m2";

  // ── 0. Remove <h1>
  root.querySelectorAll("h1").forEach((el) => el.remove());

  // ── 1+2. H2 & H3 in document order via recursive walk
  const tocItems: { id: string; text: string }[] = [];
  let h2Count = 1;
  let h3Count = 1;
  let faqSectionActive = false;

  function walkHeadings(node: NHTMLElement) {
    for (const child of node.childNodes) {
      const el = child instanceof NHTMLElement ? child : null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "h2") {
        const text = el!.innerText.trim();
        if (!text) { walkHeadings(el!); continue; }
        const id = `title-${h2Count++}`;
        el!.setAttribute("id", id);
        if (isM2) {
          el!.setAttribute("class", "section-title");
          el!.innerHTML = text;
        } else {
          el!.setAttribute("style", `font-size: ${client.h2FontSize}; line-height: ${client.h2LineHeight}; margin-top: 17px; margin-bottom: 17px;`);
          el!.innerHTML = `<span style="color: ${client.h2Color};">${client.h2Bold !== false ? `<strong>${text}</strong>` : text}</span>`;
        }
        tocItems.push({ id, text });
        if (client.faqEnabled && /faq|常見問題/i.test(text)) {
          faqSectionActive = true;
          h3Count = 1;
        }
      } else if (tag === "h3") {
        const text = el!.innerText.trim();
        if (!text) { walkHeadings(el!); continue; }
        if (isM2) {
          el!.setAttribute("class", "sub-title");
          el!.innerHTML = text;
        } else {
          const isFaq = client.faqEnabled && faqSectionActive;
          const h3Color   = isFaq ? (client.faqH3Color   || client.h3Color)    : client.h3Color;
          const h3Size    = isFaq ? (client.faqH3FontSize || client.h3FontSize) : client.h3FontSize;
          const h3Bold    = isFaq ? client.faqH3Bold : client.h3Bold;
          el!.setAttribute("style", `font-size: ${h3Size}; line-height: ${client.h3LineHeight}; margin-top: 8.5px; margin-bottom: 8.5px;`);
          let inner = text;
          if (isFaq && client.faqLabelEnabled) {
            const labelColor = client.faqLabelColor || h3Color;
            const labelSize  = client.faqLabelFontSize || h3Size;
            inner = `<span style="color: ${labelColor}; font-size: ${labelSize};">Q${h3Count}：</span>` + text;
            h3Count++;
          }
          el!.innerHTML = `<span style="color: ${h3Color};">${h3Bold !== false ? `<strong>${inner}</strong>` : inner}</span>`;
        }
      } else if (el?.childNodes?.length) {
        walkHeadings(el);
      }
    }
  }
  walkHeadings(root);

  // ── 3. p > span (font-size / color / line-height)
  // Skip spans that are inside <a>，顏色統一交給第 5 步的 <a> 清理邏輯處理
  root.querySelectorAll("p").forEach((p) => {
    const spans = p.querySelectorAll("span");
    if (spans.length > 0) {
      spans.forEach((span) => {
        if (span.closest("a")) return;
        const existing = span.getAttribute("style") || "";
        span.setAttribute("style", mergeStyles(existing, {
          "font-size": client.paragraphFontSize,
          color: client.paragraphColor,
          "line-height": client.paragraphLineHeight,
        }));
      });
    }
  });

  // ── 4. li > span
  // 跳過 <a> 內部的 span，顏色統一交給第 5 步的 <a> 清理邏輯處理
  root.querySelectorAll("li").forEach((li) => {
    li.querySelectorAll("span").forEach((span) => {
      if (span.closest("a")) return;
      const existing = span.getAttribute("style") || "";
      span.setAttribute("style", mergeStyles(existing, {
        "font-size": client.paragraphFontSize,
        color: client.listItemColor,
      }));
    });
  });

  // ── 5. anchors: button vs plain link
  root.querySelectorAll("a").forEach((a) => {
    const existing = a.getAttribute("style") || "";
    const isBtn = existing.includes("background-color") || existing.includes("padding");
    if (isBtn && !client.stripButtonStyle) {
      a.setAttribute("style", mergeStyles(existing, {
        "background-color": client.buttonBgColor,
        color: client.buttonTextColor,
        "border-radius": client.buttonBorderRadius,
        padding: client.buttonPadding,
      }));
    } else {
      if (client.stripLinkBold) {
        a.querySelectorAll("strong, b").forEach((node) => {
          node.replaceWith(node.innerHTML);
        });
      }
      // Strip button-specific properties before applying link styles
      const styleMap = parseStyleString(existing);
      ["background-color", "padding", "border-radius", "display", "font-weight"].forEach((k) => styleMap.delete(k));
      const cleaned = serializeStyleMap(styleMap);
      a.setAttribute("style", mergeStyles(cleaned, {
        color: client.linkColor,
        "text-decoration": client.linkTextDecoration,
        "font-weight": client.linkFontWeight,
      }));
      // 移除內部元素（span、strong、font...）上殘留的顏色，避免蓋掉連結顏色
      a.querySelectorAll("*").forEach((node) => {
        // 舊式 <font color="..."> 等 HTML 屬性顏色，會直接蓋掉 <a> 的顏色，需移除
        if (node.getAttribute("color")) node.removeAttribute("color");
        const nodeStyle = node.getAttribute("style") || "";
        if (!nodeStyle) return;
        const nodeMap = parseStyleString(nodeStyle);
        if (!nodeMap.has("color")) return;
        nodeMap.delete("color");
        const cleanedNode = serializeStyleMap(nodeMap);
        if (cleanedNode) node.setAttribute("style", cleanedNode);
        else node.removeAttribute("style");
      });
      // 文字外面再包一層帶連結色的 span：部分編輯器（如 Shopline）貼上時會丟棄 <a> 自身的 style，
      // 改用貼上當下算出的繼承色重新包一層 span，這裡先把正確顏色放進去讓它抓到的就是對的值
      a.innerHTML = `<span style="color: ${client.linkColor};">${a.innerHTML}</span>`;
    }
  });

  // ── 6. em → bold or colored non-italic span
  if (client.emBold) {
    root.querySelectorAll("em").forEach((em) => {
      const content = em.innerHTML;
      em.replaceWith(`<strong style="font-style: normal;">${content}</strong>`);
    });
  } else if (client.emColor) {
    root.querySelectorAll("em").forEach((em) => {
      const content = em.innerHTML;
      em.replaceWith(`<span style="color: ${client.emColor}; font-style: normal; font-weight: 400;">${content}</span>`);
    });
  }

  // ── 7. images (emoji inline images get fixed small size; content images get client styles)
  root.querySelectorAll("img").forEach((img) => {
    const role = img.getAttribute("role") || "";
    const src = img.getAttribute("src") || "";
    const isEmoji = role === "img" || src.includes("/emoji/") || src.endsWith(".svg");
    if (isEmoji) {
      img.setAttribute("style", "display: inline; height: 1em; width: 1em; vertical-align: -0.1em; margin: 0 0.05em;");
      return;
    }
    const existing = img.getAttribute("style") || "";
    img.setAttribute("style", mergeStyles(existing, {
      "max-width": client.imageMaxWidth,
      "border-radius": client.imageBorderRadius,
    }));
  });

  // ── 7.5. m2 專屬：移除內文第一張圖片（跟後台封面圖重複），順便清掉緊跟著的 <br>
  if (isM2) {
    const firstImg = root.querySelector("img");
    if (firstImg) {
      const next = firstImg.nextElementSibling;
      if (next?.tagName?.toLowerCase() === "br") next.remove();
      firstImg.remove();
    }
  }

  // ── 8. deduplicate <li> items
  if (client.deduplicateLi) {
    const seen = new Set<string>();
    root.querySelectorAll("li").forEach((li) => {
      const txt = li.innerText.trim();
      if (seen.has(txt)) {
        li.remove();
      } else {
        seen.add(txt);
      }
    });
    // Remove empty lists after dedup
    root.querySelectorAll("ul, ol").forEach((list) => {
      if (!list.querySelector("li")) list.remove();
    });
  }

  // ── 8.5. m2 專屬：表格交給 M2_STYLE_BLOCK 的 tag selector 處理，
  // 但要清掉草稿可能殘留的 inline style（如貼自 Google Docs），避免蓋掉樣式表
  if (isM2) {
    root.querySelectorAll("table, thead, tbody, tr, th, td").forEach((el) => {
      el.removeAttribute("style");
    });
  }

  // ── 8.6. m2 專屬：FAQ 區塊（H2 標題含 FAQ／常見問題）底下的 h3+段落，
  // 轉成 <details><summary> 手風琴，取代原本的 h3 小標樣式
  if (isM2) {
    const faqH2 = root.querySelectorAll("h2").find((h) => /faq|常見問題/i.test(h.innerText));
    if (faqH2) {
      let qIndex = 1;
      let node: NHTMLElement | null = faqH2.nextElementSibling;
      while (node && node.tagName?.toLowerCase() !== "h2") {
        if (node.tagName?.toLowerCase() === "h3") {
          const questionText = node.innerText.trim();
          const answerNodes: NHTMLElement[] = [];
          let sibling = node.nextElementSibling;
          while (sibling && !["h2", "h3"].includes(sibling.tagName?.toLowerCase() ?? "")) {
            answerNodes.push(sibling);
            sibling = sibling.nextElementSibling;
          }
          const answerHtml = answerNodes.map((n) => n.outerHTML).join("");
          const detailsHtml = `<details><summary>Q${qIndex}：${questionText}</summary> <div class="answer">${answerHtml}</div></details>`;
          node.replaceWith(detailsHtml);
          answerNodes.forEach((n) => n.remove());
          qIndex++;
          node = sibling;
          continue;
        }
        node = node.nextElementSibling;
      }
    }
  }

  // ── 9. Insert TOC before first H2 (via string replace to preserve onclick)
  let result = root.toString();
  if (client.generateToc && tocItems.length > 0) {
    const firstH2Match = result.match(/<h2[\s>]/i);
    if (firstH2Match && firstH2Match.index !== undefined) {
      const toc = (isM2
        ? generateM2TocHtml(tocItems)
        : generateTocHtml(
            tocItems,
            client.linkColor,
            client.tocTitle,
            client.tocBgColor ?? "#f9f9f9",
            client.tocBgOpacity ?? 100,
            client.paragraphFontSize,
            articleUrl
          )) + "\n";
      result = result.slice(0, firstH2Match.index) + toc + result.slice(firstH2Match.index);
    }
  }

  if (isM2) {
    result = M2_STYLE_BLOCK + result;
  }

  return result;
}
