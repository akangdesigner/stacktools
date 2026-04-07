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

function generateTocHtml(items: { id: string; text: string }[], linkColor: string, tocTitle: string): string {
  const links = items
    .map((item) => `<li><a href="#${item.id}" style="color: ${linkColor}; text-decoration: underline; font-weight: 400;">${item.text}</a></li>`)
    .join("");
  return `<div class="catalog-box" style="background-color: #f9f9f9; padding: 20px; border-radius: 10px; margin-bottom: 30px;"><p style="font-size: 20px; font-weight: bold; color: #333333; margin-bottom: 15px;">${tocTitle}</p><ul style="list-style-type: decimal; padding-left: 20px; line-height: 1.8;">${links}</ul></div>`;
}

export function cleanHtml(rawHtml: string, client: ClientProfile): string {
  const root = parse(rawHtml);

  // ── 1. H2: restructure to <h2 id="title-N" style="..."><span style="color:..."><strong>text</strong></span></h2>
  const tocItems: { id: string; text: string }[] = [];
  let h2Count = 1;
  root.querySelectorAll("h2").forEach((el) => {
    const text = el.innerText.trim();
    if (!text) return;
    const id = `title-${h2Count++}`;
    el.setAttribute("id", id);
    el.setAttribute("style", `font-size: ${client.h2FontSize}; line-height: ${client.h2LineHeight}; margin-top: 17px; margin-bottom: 17px;`);
    el.innerHTML = `<span style="color: ${client.h2Color};"><strong>${text}</strong></span>`;
    tocItems.push({ id, text });
  });

  // ── 2. H3: restructure to <h3 style="..."><span style="color:..."><strong>text</strong></span></h3>
  root.querySelectorAll("h3").forEach((el) => {
    const text = el.innerText.trim();
    if (!text) return;
    el.setAttribute("style", `font-size: ${client.h3FontSize}; line-height: ${client.h3LineHeight}; margin-top: 8.5px; margin-bottom: 8.5px;`);
    el.innerHTML = `<span style="color: ${client.h3Color};"><strong>${text}</strong></span>`;
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

  // ── 6. em → colored non-italic span (if emColor is set)
  if (client.emColor) {
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

  // ── 9. Insert TOC before first H2
  if (client.generateToc && tocItems.length > 0) {
    const firstH2 = root.querySelector("h2");
    if (firstH2) {
      firstH2.insertAdjacentHTML("beforebegin", generateTocHtml(tocItems, client.linkColor, client.tocTitle) + "\n");
    }
  }

  return root.toString();
}
