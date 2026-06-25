import { parse, HTMLElement as NHTMLElement } from "node-html-parser";

export interface BrandInfo {
  brandName: string;
  officialUrl: string;
  productImage: string;
  title: string;
  metaDescription: string;
  ogDescription: string;
  price: string;
  fetchStatus: "success" | "failed";
  error?: string;
}

interface ImageCandidate {
  url: string;
  tag: string;
  score: number;
}

const BAD_IMAGE_KEYWORDS = [
  "logo", "icon", "favicon", "banner", "hero", "header", "footer",
  "facebook", "share", "og", "default", "placeholder", "avatar",
  "loading", "blank", "line", "instagram", "youtube", "1200x", "social", "cover",
];

const GOOD_IMAGE_KEYWORDS = [
  "product", "products", "goods", "item", "upload_product", "shop",
  "sku", "prod", "original", "large", "main", "image_clips",
];

function normalizeUrl(url: string, baseUrl: string): string {
  if (!url) return "";
  let u = url.replace(/&amp;/g, "&").trim();
  if (u.startsWith("//")) u = "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  try {
    return new URL(u, baseUrl).href;
  } catch {
    return "";
  }
}

// 從 JSON-LD（schema.org Product）抓官方標記的商品圖，準確度最高，優先採用
function extractJsonLdProductImages(root: NHTMLElement, baseUrl: string): string[] {
  const images: string[] = [];

  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    const type = o["@type"];
    const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));

    if (isProduct && o.image) {
      const img = o.image;
      if (Array.isArray(img)) {
        for (const item of img) {
          if (typeof item === "string") images.push(normalizeUrl(item, baseUrl));
          else if (item && typeof item === "object" && "url" in item) {
            images.push(normalizeUrl(String((item as Record<string, unknown>).url), baseUrl));
          }
        }
      } else if (typeof img === "string") {
        images.push(normalizeUrl(img, baseUrl));
      } else if (img && typeof img === "object" && "url" in img) {
        images.push(normalizeUrl(String((img as Record<string, unknown>).url), baseUrl));
      }
    }

    for (const value of Object.values(o)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  };

  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.innerHTML.trim());
      (Array.isArray(parsed) ? parsed : [parsed]).forEach(walk);
    } catch {
      // 忽略無法解析的 JSON-LD 區塊
    }
  }

  return [...new Set(images)].filter(Boolean);
}

function extractDomImageCandidates(root: NHTMLElement, baseUrl: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];

  for (const img of root.querySelectorAll("img")) {
    const srcset = img.getAttribute("srcset");
    const src =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-lazy-src") ||
      (srcset ? srcset.split(",")[0]?.trim().split(" ")[0] : undefined);
    if (!src) continue;
    const url = normalizeUrl(src, baseUrl);
    if (!url) continue;
    candidates.push({ url, tag: img.outerHTML, score: 0 });
  }

  for (const source of root.querySelectorAll("source")) {
    const srcset = source.getAttribute("srcset");
    if (!srcset) continue;
    const first = srcset.split(",")[0]?.trim().split(" ")[0];
    if (!first) continue;
    const url = normalizeUrl(first, baseUrl);
    if (!url) continue;
    candidates.push({ url, tag: source.outerHTML, score: 0 });
  }

  return candidates;
}

function scoreImage(candidate: ImageCandidate, brandName: string): number {
  const url = candidate.url.toLowerCase();
  const tag = candidate.tag.toLowerCase();
  let score = candidate.score;

  if (BAD_IMAGE_KEYWORDS.some((k) => url.includes(k) || tag.includes(k))) score -= 80;
  if (GOOD_IMAGE_KEYWORDS.some((k) => url.includes(k) || tag.includes(k))) score += 40;
  if (brandName && tag.includes(brandName.toLowerCase())) score += 30;
  if (/product|goods|item|main-image|product-image|swiper-slide|gallery/i.test(tag)) score += 50;
  if (url.includes("upload_product")) score += 100;
  if (url.includes("images/goods")) score += 100;
  if (url.includes("product")) score += 60;
  if (url.includes("media/image_clips")) score += 40;
  if (url.includes("shopline")) score += 30;
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 10;
  if (url.includes("1200x630") || url.includes("1200x628")) score -= 100;

  const widthMatch = tag.match(/width=["']?(\d+)/i);
  const heightMatch = tag.match(/height=["']?(\d+)/i);
  const width = widthMatch ? Number(widthMatch[1]) : 0;
  const height = heightMatch ? Number(heightMatch[1]) : 0;
  if (width >= 250 && height >= 250) score += 20;
  if ((width && width < 120) || (height && height < 120)) score -= 60;

  return score;
}

function pickBestImage(jsonLdImages: string[], domCandidates: ImageCandidate[], brandName: string): string {
  const blocked = ["logo", "favicon", "icon", "facebook", "share", "banner", "1200x630", "1200x628"];

  const all: ImageCandidate[] = [
    ...jsonLdImages.map((url) => ({ url, tag: "jsonld product image", score: 200 })),
    ...domCandidates,
  ].filter((c) => !blocked.some((k) => c.url.toLowerCase().includes(k)));

  const scored = all
    .map((c) => ({ ...c, score: scoreImage(c, brandName) }))
    .sort((a, b) => b.score - a.score);

  // 分數太低寧可不要抓，避免顯示錯誤的圖
  return scored[0] && scored[0].score >= 40 ? scored[0].url : "";
}

export async function fetchBrandInfo(brandName: string, officialUrl: string): Promise<BrandInfo> {
  const empty: Omit<BrandInfo, "fetchStatus" | "error"> = {
    brandName,
    officialUrl,
    productImage: "",
    title: "",
    metaDescription: "",
    ogDescription: "",
    price: "",
  };

  if (!officialUrl) {
    return { ...empty, fetchStatus: "failed", error: "缺少官方網址" };
  }

  try {
    const res = await fetch(officialUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StacktoolsBot/1.0)",
        Accept: "text/html",
        "Accept-Language": "zh-TW,zh;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { ...empty, fetchStatus: "failed", error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const root = parse(html);

    const title = root.querySelector("title")?.innerText.trim() ?? "";
    const metaDescription =
      root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
    const ogDescription =
      root.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ?? "";
    const price =
      root.querySelector('meta[property="product:price:amount"]')?.getAttribute("content")?.trim() ??
      root.querySelector('[itemprop="price"]')?.getAttribute("content")?.trim() ??
      "";

    const jsonLdImages = extractJsonLdProductImages(root, officialUrl);
    const domCandidates = extractDomImageCandidates(root, officialUrl);
    const productImage = pickBestImage(jsonLdImages, domCandidates, brandName);

    return {
      brandName,
      officialUrl,
      productImage,
      title,
      metaDescription,
      ogDescription,
      price,
      fetchStatus: "success",
    };
  } catch (err) {
    return { ...empty, fetchStatus: "failed", error: String(err) };
  }
}
