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

function isButtonAnchor(style: string): boolean {
  return style.includes("background-color") || style.includes("padding");
}

function generateTocHtml(items: { id: string; text: string }[], linkColor: string, tocTitle: string, articleUrl?: string): string {
  const base = articleUrl ? articleUrl.replace(/#.*$/, "") : ".";
  const links = items
    .map((item) => `<li><a href="${base}#${item.id}" target="_self" style="color: ${linkColor}; text-decoration: underline; font-weight: 400;">${item.text}</a></li>`)
    .join("");
  return `<div class="catalog-box" style="background-color: #f9f9f9; padding: 20px; border-radius: 10px; margin-bottom: 30px;"><p style="font-size: 20px; font-weight: bold; color: #333333; margin-bottom: 15px;">${tocTitle}</p><ul style="list-style-type: decimal; padding-left: 20px; line-height: 1.8;">${links}</ul></div>`;
}

export function cleanHtml(rawHtml: string, client: ClientProfile, articleUrl?: string): string {
  const root = parse(rawHtml);

  // ── 0. Remove <h1>
  root.querySelectorAll("h1").forEach((el) => el.remove());

  // ── 1. H2: id goes on inner <span> so CMS won't strip it
  const tocItems: { id: string; text: string }[] = [];
  let h2Count = 1;
  root.querySelectorAll("h2").forEach((el) => {
    const text = el.innerText.trim();
    if (!text) return;
    const id = `title-${h2Count++}`;
    el.setAttribute("id", id);
    el.setAttribute("style", `font-size: ${client.h2FontSize}; line-height: ${client.h2LineHeight}; margin-top: 17px; margin-bottom: 17px;`);
    el.innerHTML = `<span style="color: ${client.h2Color};">${client.h2Bold !== false ? `<strong>${text}</strong>` : text}</span>`;
    tocItems.push({ id, text });
  });

  // ── 2. H3: restructure to <h3 style="..."><span style="color:..."><strong>text</strong></span></h3>
  root.querySelectorAll("h3").forEach((el) => {
    const text = el.innerText.trim();
    if (!text) return;
    el.setAttribute("style", `font-size: ${client.h3FontSize}; line-height: ${client.h3LineHeight}; margin-top: 8.5px; margin-bottom: 8.5px;`);
    el.innerHTML = `<span style="color: ${client.h3Color};">${client.h3Bold !== false ? `<strong>${text}</strong>` : text}</span>`;
  });

  // ── 3. p > span (font-size / color / line-height)
  root.querySelectorAll("p").forEach((p) => {
    const spans = p.querySelectorAll("span");
    if (spans.length > 0) {
      spans.forEach((span) => {
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
        "font-size": client.listItemFontSize,
        color: client.listItemColor,
      }));
    });
  });

  // ── 5. anchors: button vs plain link
  root.querySelectorAll("a").forEach((a) => {
    const existing = a.getAttribute("style") || "";
    if (isButtonAnchor(existing)) {
      a.setAttribute("style", mergeStyles(existing, {
        "background-color": client.buttonBgColor,
        color: client.buttonTextColor,
        "border-radius": client.buttonBorderRadius,
        padding: client.buttonPadding,
      }));
    } else {
      // Remove bold inside links if requested
      if (client.stripLinkBold) {
        a.querySelectorAll("strong, b").forEach((node) => {
          node.replaceWith(node.innerHTML);
        });
      }
      a.setAttribute("style", mergeStyles(existing, {
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

  // ── 7. images
  root.querySelectorAll("img").forEach((img) => {
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
      const toc = generateTocHtml(tocItems, client.linkColor, client.tocTitle, articleUrl) + "\n";
      result = result.slice(0, firstH2Match.index) + toc + result.slice(firstH2Match.index);
    }
  }

  return result;
}
