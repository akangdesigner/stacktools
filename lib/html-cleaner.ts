import { parse } from "node-html-parser";
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

function generateTocHtml(items: { id: string; text: string }[], linkColor: string, tocTitle: string, tocBgColor: string, tocBgOpacity: number, articleUrl?: string): string {
  const base = articleUrl ? articleUrl.replace(/#.*$/, "") : ".";
  const links = items
    .map((item) => `<li><a href="${base}#${item.id}" target="_self" style="color: ${linkColor}; text-decoration: underline; font-weight: 400;">${item.text}</a></li>`)
    .join("");
  const bgStyle = tocBgColor ? `background-color: ${hexToRgba(tocBgColor, tocBgOpacity)}; ` : "background-color: transparent; ";
  return `<div class="catalog-box" style="${bgStyle}padding: 20px; border-radius: 10px; margin-bottom: 30px;"><p style="font-size: 20px; font-weight: bold; color: #333333; margin-bottom: 15px;">${tocTitle}</p><ul style="list-style-type: decimal; padding-left: 20px; line-height: 1.8;">${links}</ul></div>`;
}

export function cleanHtml(rawHtml: string, client: ClientProfile, articleUrl?: string): string {
  const root = parse(rawHtml);

  // ── 0. Remove <h1>
  root.querySelectorAll("h1").forEach((el) => el.remove());

  // ── 1+2. H2 & H3 in document order via recursive walk
  const tocItems: { id: string; text: string }[] = [];
  let h2Count = 1;
  let h3Count = 1;
  let faqSectionActive = false;

  function walkHeadings(node: ReturnType<typeof parse>) {
    for (const child of node.childNodes) {
      const tag = (child as any).tagName?.toLowerCase();
      if (tag === "h2") {
        const el = child as ReturnType<typeof root.querySelector>;
        const text = el!.innerText.trim();
        if (!text) { walkHeadings(child as any); continue; }
        const id = `title-${h2Count++}`;
        el!.setAttribute("id", id);
        el!.setAttribute("style", `font-size: ${client.h2FontSize}; line-height: ${client.h2LineHeight}; margin-top: 17px; margin-bottom: 17px;`);
        el!.innerHTML = `<span style="color: ${client.h2Color};">${client.h2Bold !== false ? `<strong>${text}</strong>` : text}</span>`;
        tocItems.push({ id, text });
        if (client.faqEnabled && /faq/i.test(text)) {
          faqSectionActive = true;
          h3Count = 1;
        }
      } else if (tag === "h3") {
        const el = child as ReturnType<typeof root.querySelector>;
        const text = el!.innerText.trim();
        if (!text) { walkHeadings(child as any); continue; }
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
      } else if ((child as any).childNodes?.length) {
        walkHeadings(child as any);
      }
    }
  }
  walkHeadings(root as any);

  // ── 3. p > span (font-size / color / line-height)
  // Skip spans that are inside <a> to avoid overriding link color
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
  root.querySelectorAll("li").forEach((li) => {
    li.querySelectorAll("span").forEach((span) => {
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

  // ── 9. Insert TOC before first H2 (via string replace to preserve onclick)
  let result = root.toString();
  if (client.generateToc && tocItems.length > 0) {
    const firstH2Match = result.match(/<h2[\s>]/i);
    if (firstH2Match && firstH2Match.index !== undefined) {
      const toc = generateTocHtml(
        tocItems,
        client.linkColor,
        client.tocTitle,
        client.tocBgColor ?? "#f9f9f9",
        client.tocBgOpacity ?? 100,
        articleUrl
      ) + "\n";
      result = result.slice(0, firstH2Match.index) + toc + result.slice(firstH2Match.index);
    }
  }

  return result;
}
