import { createClient } from "@supabase/supabase-js";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type RequestBody = {
  url?: string;
};

type ParsedVariant = {
  name: string;
  sku: string | null;
  imageUrl: string | null;
};

type ParsedVariantOption = ParsedVariant & {
  active: boolean;
  paramName: string | null;
  paramValue: string | null;
};

type ModificationInput = {
  id: string | null;
  name: string;
  prop: string | null;
  value: string;
};

type ModificationContext = {
  actionUrl: string;
  inputs: ModificationInput[];
  variants: ParsedVariantOption[];
};

type FetchedAvanprintPage = {
  html: string;
  cookie: string | null;
};

const AVANPRINT_HOSTS = new Set(["avanprint.ua", "www.avanprint.ua"]);
const CHALLENGE_COOKIE_PATTERN = /document\.cookie\s*=\s*"challenge_passed="\s*\+\s*defaultHash/i;
const CHALLENGE_HASH_PATTERN = /defaultHash\s*=\s*"([^"]+)"/i;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function decodeHtml(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&bull;/gi, "•")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&sup2;/gi, "²")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSpaces(value?: string | null) {
  return decodeHtml(value ?? "").replace(/\s+/g, " ").trim();
}

function getMeta(html: string, key: string) {
  const propertyPattern = new RegExp(
    `<meta\\s+[^>]*(?:property|name)=["']${escapeRegex(key)}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const contentFirstPattern = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegex(key)}["'][^>]*>`,
    "i"
  );
  return normalizeSpaces(html.match(propertyPattern)?.[1] ?? html.match(contentFirstPattern)?.[1] ?? "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getItempropMeta(html: string, key: string) {
  const itempropPattern = new RegExp(
    `<meta\\s+[^>]*itemprop=["']${escapeRegex(key)}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const contentFirstPattern = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*itemprop=["']${escapeRegex(key)}["'][^>]*>`,
    "i"
  );
  return normalizeSpaces(html.match(itempropPattern)?.[1] ?? html.match(contentFirstPattern)?.[1] ?? "");
}

function getHtmlAttribute(tag: string, attr: string) {
  const match = tag.match(new RegExp(`\\b${escapeRegex(attr)}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return normalizeSpaces(match?.[2] ?? "");
}

function absolutizeUrl(value: string, pageUrl: string) {
  const trimmed = decodeHtml(value).trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed, pageUrl).toString();
  } catch {
    return "";
  }
}

function toFullImageUrl(value: string, pageUrl: string) {
  const absolute = absolutizeUrl(value, pageUrl);
  return absolute.replace(/\/\d+x\d+l\d+nn\d+\//, "/1800x1800l80nn100/");
}

function getTextBetween(value: string, startPattern: RegExp, endPattern: RegExp) {
  const startMatch = startPattern.exec(value);
  if (!startMatch || startMatch.index === undefined) return "";
  const startIndex = startMatch.index + startMatch[0].length;
  const rest = value.slice(startIndex);
  const endMatch = endPattern.exec(rest);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

function parseDescriptionHtml(html: string) {
  const match = html.match(/<div[^>]*class=["'][^"']*product-description[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<script/i);
  return match?.[1] ?? "";
}

function extractMethods(descriptionText: string) {
  const match = descriptionText.match(/Тип\s+нанесення\s*:\s*([\s\S]*?)(?:\n\n|$)/i);
  if (!match?.[1]) return [];
  return Array.from(
    new Set(
      match[1]
        .replace(/•/g, ",")
        .split(/[,;/\n]+/)
        .map((item) => normalizeSpaces(item))
        .map((item) => item.replace(/[.。]+$/g, "").trim())
        .filter(Boolean)
    )
  );
}

function extractSizes(descriptionText: string) {
  const match = descriptionText.match(/розмір[иі]?\s*:\s*([^\n]+)/i);
  if (!match?.[1]) return [];
  return Array.from(
    new Set(
      match[1]
        .split(/[,;/]+/)
        .flatMap((item) => item.split(/\s+-\s+/).length === 2 ? [item.trim()] : item.split(/\s+/))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function extractSpec(descriptionText: string, label: string) {
  const match = descriptionText.match(new RegExp(`${escapeRegex(label)}\\s*:\\s*([^\\n]+)`, "i"));
  return normalizeSpaces(match?.[1] ?? "");
}

function parseBreadcrumbs(html: string) {
  return Array.from(html.matchAll(/<span\s+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/gi))
    .map((match) => stripTags(match[1]))
    .filter(Boolean)
    .filter((name) => !["Головна"].includes(name));
}

function parseSku(html: string) {
  return (
    getItempropMeta(html, "sku") ||
    stripTags(getTextBetween(html, /product-header__code-title["'][^>]*>\s*Артикул\s*<\/span>/i, /<\/div>/i))
  );
}

function guessKindHints(name: string, categoryPath: string[]) {
  const haystack = `${name} ${categoryPath.join(" ")}`.toLowerCase();
  const hints: string[] = [];
  if (/в[іi]тровк/.test(haystack)) hints.push("Вітровка");
  if (/куртк/.test(haystack)) hints.push("Куртка", "Куртки");
  if (/футболк/.test(haystack)) hints.push("Футболка");
  if (/поло/.test(haystack)) hints.push("Поло");
  if (/св[іi]тшот/.test(haystack)) hints.push("Світшот");
  if (/худ[іi]/.test(haystack)) hints.push("Худі");
  if (/кепк|бейсболк/.test(haystack)) hints.push("Кепка");
  if (/пакет/.test(haystack)) hints.push("Пакет");
  if (/блокнот/.test(haystack)) hints.push("Блокнот");
  return Array.from(new Set([...hints, ...categoryPath.slice(0, -1).reverse(), getMetaCategoryFallback(categoryPath)]).values()).filter(Boolean);
}

function getMetaCategoryFallback(categoryPath: string[]) {
  return categoryPath[categoryPath.length - 1] ?? "";
}

function parseModificationContext(html: string, pageUrl: string, sku: string | null): ModificationContext | null {
  const formMatch = html.match(
    /<form\b[^>]*data-action=["']([^"']*\/catalog\/load-modification\/[^"']*)["'][^>]*>([\s\S]*?)<\/form>/i
  );
  if (!formMatch?.[1] || !formMatch[2]) return null;

  const formHtml = formMatch[2];
  const inputs = Array.from(formHtml.matchAll(/<input\b[^>]*>/gi))
    .map((match): ModificationInput | null => {
      const tag = match[0];
      const name = getHtmlAttribute(tag, "name");
      if (!name) return null;
      return {
        id: getHtmlAttribute(tag, "id") || null,
        name,
        prop: getHtmlAttribute(tag, "data-prop") || name.match(/^param\[([^\]]+)\]$/)?.[1] || null,
        value: getHtmlAttribute(tag, "value"),
      };
    })
    .filter((input): input is ModificationInput => Boolean(input));

  const defaultInput = inputs.find((input) => input.prop) ?? inputs[0] ?? null;
  if (!defaultInput) return null;

  const variants: ParsedVariantOption[] = [];
  const seen = new Set<string>();
  const modificationBlocks = Array.from(
    formHtml.matchAll(/<a\b[^>]*class=["'][^"']*modification__item[^"']*["'][\s\S]*?<\/a>/gi)
  ).map((match) => match[0]);

  for (const block of modificationBlocks) {
    const name = getHtmlAttribute(block, "title");
    if (!name || seen.has(name.toLowerCase())) continue;
    const imageSource =
      getHtmlAttribute(block, "src") ||
      getHtmlAttribute(block, "data-src") ||
      "";
    const imageUrl = imageSource ? toFullImageUrl(imageSource, pageUrl) : null;
    const isActive = /\bmodification__item--active\b/.test(block);
    const targetId = block.match(/\$\(["']#([^"']+)["']\)\.val/i)?.[1] ?? null;
    const input = (targetId ? inputs.find((item) => item.id === targetId) : null) ?? defaultInput;
    const nextValue =
      block.match(/\.val\(["']([^"']+)["']\)/i)?.[1] ||
      getHtmlAttribute(block, "data-tooltip-id") ||
      (isActive ? input.value : "");
    variants.push({
      name,
      sku: isActive ? sku : null,
      imageUrl,
      active: isActive,
      paramName: input.prop,
      paramValue: nextValue || null,
    });
    seen.add(name.toLowerCase());
  }

  if (variants.length === 0) return null;

  return {
    actionUrl: absolutizeUrl(formMatch[1], pageUrl),
    inputs,
    variants,
  };
}

function parseGalleryImages(html: string, pageUrl: string) {
  return Array.from(html.matchAll(/\bdata-href=["']([^"']+)["']/gi))
    .map((match) => toFullImageUrl(match[1], pageUrl))
    .filter(Boolean)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function parsePrice(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGlobalCsrfToken(html: string) {
  return normalizeSpaces(html.match(/GLOBAL_CSRF_TOKEN\s*:\s*['"]([^'"]+)['"]/i)?.[1] ?? "");
}

function extractAjaxHtml(payloadText: string) {
  try {
    const payload = JSON.parse(payloadText) as {
      response?: {
        html?: Array<{ content?: string | null }> | string | null;
      } | null;
    };
    const html = payload?.response?.html;
    if (Array.isArray(html)) {
      return html.map((block) => block.content ?? "").join("\n");
    }
    return typeof html === "string" ? html : "";
  } catch {
    return payloadText;
  }
}

async function fetchModificationVariant(
  context: ModificationContext,
  option: ParsedVariantOption,
  pageUrl: string,
  cookie: string | null,
  csrfToken: string
): Promise<ParsedVariantOption> {
  if (option.active || !option.paramName || !option.paramValue || !context.actionUrl) return option;

  const body = new URLSearchParams();
  for (const input of context.inputs) {
    body.append(input.name, input.prop === option.paramName ? option.paramValue : input.value);
  }

  const endpoint = `${context.actionUrl.replace(/\/?$/, "/")}${encodeURIComponent(option.paramName)}/`;
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: {
      ...getBrowserHeaders(cookie ?? undefined),
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: pageUrl,
      Origin: new URL(pageUrl).origin,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: body.toString(),
  });
  if (!response.ok) return option;

  const ajaxHtml = extractAjaxHtml(await response.text());
  const sku = parseSku(ajaxHtml) || option.sku;
  const imageUrl = parseGalleryImages(ajaxHtml, pageUrl)[0] || option.imageUrl;
  return {
    ...option,
    sku: normalizeSpaces(sku) || null,
    imageUrl: imageUrl || null,
  };
}

async function parseProduct(html: string, pageUrl: string, cookie: string | null) {
  const title =
    stripTags(html.match(/<h1[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    getMeta(html, "og:title").replace(/\s+-\s+AVANPRINT.*$/i, "");
  const sku = parseSku(html);
  const brand = getMeta(html, "product:brand") || getItempropMeta(html, "brand");
  const category = getItempropMeta(html, "category");
  const categoryPath = category
    ? category.split("/").map((item) => normalizeSpaces(item)).filter(Boolean)
    : parseBreadcrumbs(html).slice(0, -1);
  const imageUrl = getMeta(html, "og:image") || parseGalleryImages(html, pageUrl)[0] || "";
  const descriptionHtml = parseDescriptionHtml(html);
  const descriptionText = stripTags(descriptionHtml);
  const methods = extractMethods(descriptionText);
  const sizes = extractSizes(descriptionText);
  const price = parsePrice(getMeta(html, "product:price:amount"));
  const oldPrice = parsePrice(getMeta(html, "product:original_price:amount"));
  const color = getMeta(html, "product:color");
  const modificationContext = parseModificationContext(html, pageUrl, sku || null);
  const csrfToken = parseGlobalCsrfToken(html);
  const modificationVariants =
    modificationContext && modificationContext.variants.length > 0
      ? await Promise.all(
          modificationContext.variants.map((variant) =>
            fetchModificationVariant(modificationContext, variant, pageUrl, cookie, csrfToken).catch(() => variant)
          )
        )
      : [];
  const variants =
    modificationVariants.length > 0
      ? modificationVariants.map(({ active: _active, paramName: _paramName, paramValue: _paramValue, ...variant }) => variant)
      : [
          {
            name: color,
            sku: sku || null,
            imageUrl: imageUrl ? toFullImageUrl(imageUrl, pageUrl) : null,
          },
        ].filter((variant) => variant.name || variant.sku || variant.imageUrl);
  const galleryImages = parseGalleryImages(html, pageUrl);
  const typeHints = Array.from(new Set(["Одяг", "Одяг під брендування", categoryPath[0]].filter(Boolean)));
  const kindHints = guessKindHints(title, categoryPath);
  const specs = [
    { label: "Бренд", value: brand },
    { label: "Категорія Avanprint", value: categoryPath.join(" / ") },
    { label: "Артикул", value: sku },
    { label: "Склад", value: extractSpec(descriptionText, "Склад") },
    { label: "Щільність", value: extractSpec(descriptionText, "Щільність") },
    { label: "Розміри", value: sizes.join(", ") },
    { label: "Тип нанесення", value: methods.join(", ") },
  ].filter((item) => item.value);

  return {
    source: "avanprint",
    sourceUrl: pageUrl,
    name: normalizeSpaces(title),
    sku: normalizeSpaces(sku) || null,
    brand: normalizeSpaces(brand) || null,
    categoryPath,
    typeHints,
    kindHints,
    price,
    oldPrice,
    imageUrl: imageUrl ? toFullImageUrl(imageUrl, pageUrl) : null,
    galleryImages,
    variants,
    methods,
    sizes,
    description: descriptionText,
    specs,
  };
}

function validateAvanprintUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Некоректний URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !AVANPRINT_HOSTS.has(parsed.hostname)) {
    throw new Error("Підтримуються тільки посилання на avanprint.ua.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function getBrowserHeaders(cookie?: string) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function fetchAvanprintPage(url: string): Promise<FetchedAvanprintPage> {
  const firstResponse = await fetch(url, {
    redirect: "follow",
    headers: getBrowserHeaders(),
  });
  const firstHtml = await firstResponse.text();
  if (!firstResponse.ok) {
    throw new Error(`Avanprint відповів ${firstResponse.status}.`);
  }

  if (CHALLENGE_COOKIE_PATTERN.test(firstHtml)) {
    const hash = firstHtml.match(CHALLENGE_HASH_PATTERN)?.[1];
    if (hash) {
      const cookie = `challenge_passed=${hash}`;
      const secondResponse = await fetch(url, {
        redirect: "follow",
        headers: getBrowserHeaders(cookie),
      });
      const secondHtml = await secondResponse.text();
      if (!secondResponse.ok) {
        throw new Error(`Avanprint відповів ${secondResponse.status}.`);
      }
      return { html: secondHtml, cookie };
    }
  }

  return { html: firstHtml, cookie: null };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  let url: string;
  try {
    url = validateAvanprintUrl((payload.url ?? "").trim());
  } catch (error) {
    return jsonResponse(400, { error: error instanceof Error ? error.message : "Некоректний URL." });
  }

  try {
    const page = await fetchAvanprintPage(url);
    const product = await parseProduct(page.html, url, page.cookie);
    if (!product.name) {
      return jsonResponse(422, { error: "Не вдалося знайти назву товару на сторінці Avanprint." });
    }
    return jsonResponse(200, { success: true, product });
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : "Не вдалося імпортувати товар з Avanprint.",
    });
  }
};
