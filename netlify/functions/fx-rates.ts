const MINFIN_MB_URL = "https://minfin.com.ua/ua/currency/mb/";
const MINFIN_EUR_MB_URL = "https://minfin.com.ua/ua/currency/mb/eur/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

type HttpEvent = {
  httpMethod?: string;
};

type ParsedRate = {
  buy: number;
  sell: number;
  sellChange: number | null;
};

type CurrencyWidgetEntry = {
  buy?: {
    interbank?: string | number | null;
  } | null;
  sell?: {
    interbank?: string | number | null;
  } | null;
};

type ExchangeRateJsonLdItem = {
  "@type"?: string;
  currency?: string;
  description?: string;
  currentExchangeRate?: {
    price?: string | number | null;
  } | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
    body: JSON.stringify(body),
  };
}

function parseDecimal(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUnknownDecimal(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return parseDecimal(value);
  }
  return null;
}

function extractRow(html: string, code: "USD" | "EUR") {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gu);
  if (!rows) return null;
  return rows.find((row) => row.includes(`>${code}</a>`)) ?? null;
}

function extractCellValues(rowHtml: string) {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)].map((match) => match[1]);
}

function extractNumericValue(cellHtml: string) {
  const match = cellHtml.match(/>([0-9]+(?:[.,][0-9]+)?)</u);
  return match ? parseDecimal(match[1]) : null;
}

function extractChangeValue(cellHtml: string) {
  const sign =
    cellHtml.includes("#growth-usage") ? 1 : cellHtml.includes("#polygon-usage") ? -1 : null;
  if (sign === null) return null;

  const match = cellHtml.match(/<p[^>]*>\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*<\/p>/u);
  const magnitude = match ? parseDecimal(match[1]) : null;
  return magnitude === null ? null : sign * Math.abs(magnitude);
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractRatesFromText(html: string) {
  const text = stripHtml(html);
  const match = text.match(
    /Купівля\s+([0-9]+(?:[.,][0-9]+)?)\s+([+-][0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([+-][0-9]+(?:[.,][0-9]+)?)\s+Продаж\s+([0-9]+(?:[.,][0-9]+)?)\s+([+-][0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([+-][0-9]+(?:[.,][0-9]+)?)/u
  );
  if (!match) return null;

  const usdBuy = parseDecimal(match[1]);
  const eurBuy = parseDecimal(match[3]);
  const usdSell = parseDecimal(match[5]);
  const eurSell = parseDecimal(match[7]);
  const usdSellChange = parseDecimal(match[6]);
  const eurSellChange = parseDecimal(match[8]);
  if (!usdBuy || !eurBuy || !usdSell || !eurSell) return null;

  return {
    usd: {
      buy: usdBuy,
      sell: usdSell,
      sellChange: usdSellChange,
    },
    eur: {
      buy: eurBuy,
      sell: eurSell,
      sellChange: eurSellChange,
    },
  };
}

function extractRatesFromWidgetJson(html: string) {
  const match = html.match(/var\s+curWgtJSON\s*=\s*(\{[\s\S]*?\});/u);
  if (!match) return null;

  let parsed: Record<string, CurrencyWidgetEntry> | null = null;
  try {
    parsed = JSON.parse(match[1]) as Record<string, CurrencyWidgetEntry>;
  } catch {
    return null;
  }

  const usdEntry = parsed?.USD;
  const eurEntry = parsed?.EUR;
  const usdBuy = parseUnknownDecimal(usdEntry?.buy?.interbank);
  const usdSell = parseUnknownDecimal(usdEntry?.sell?.interbank);
  const eurBuy = parseUnknownDecimal(eurEntry?.buy?.interbank);
  const eurSell = parseUnknownDecimal(eurEntry?.sell?.interbank);

  if (!usdBuy || !usdSell || !eurBuy || !eurSell) {
    return null;
  }

  return {
    usd: {
      buy: usdBuy,
      sell: usdSell,
      sellChange: null,
    },
    eur: {
      buy: eurBuy,
      sell: eurSell,
      sellChange: null,
    },
  };
}

function parseJsonLdBlocks(html: string) {
  return [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function normalizeDescription(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function extractRateFromJsonLd(html: string, code: "USD" | "EUR"): ParsedRate | null {
  const blocks = parseJsonLdBlocks(html);
  const items: ExchangeRateJsonLdItem[] = [];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block) as unknown;
      const collect = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(collect);
          return;
        }

        const record = value as Record<string, unknown>;
        if (record["@type"] === "ExchangeRateSpecification") {
          items.push(record as ExchangeRateJsonLdItem);
        }
        Object.values(record).forEach(collect);
      };
      collect(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other strategies.
    }
  }

  const matches = items.filter((item) => (item.currency ?? "").trim().toUpperCase() === code);
  if (matches.length === 0) return null;

  const buyItem = matches.find((item) => normalizeDescription(item.description).includes("куп"));
  const sellItem = matches.find((item) => normalizeDescription(item.description).includes("прод"));
  const buy = parseUnknownDecimal(buyItem?.currentExchangeRate?.price);
  const sell = parseUnknownDecimal(sellItem?.currentExchangeRate?.price);
  if (!buy || !sell) return null;

  return {
    buy,
    sell,
    sellChange: null,
  };
}

function extractCurrencyRate(html: string, code: "USD" | "EUR"): ParsedRate | null {
  const row = extractRow(html, code);
  if (!row) return null;

  const cells = extractCellValues(row);
  if (cells.length < 3) return null;

  const buy = extractNumericValue(cells[1]);
  const sell = extractNumericValue(cells[2]);
  const sellChange = extractChangeValue(cells[2]);
  if (!buy || !sell || buy <= 0 || sell <= 0) return null;
  return { buy, sell, sellChange };
}

function extractUpdatedAt(html: string) {
  const match = html.match(/Оновлено(?:<!-- -->\s*)*(\d{2}\.\d{2}\.\d{4},\s*\d{2}:\d{2})/u);
  return match?.[1] ?? null;
}

async function loadHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Minfin responded with HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function loadMinfinRates() {
  const [usdHtml, eurHtml] = await Promise.all([loadHtml(MINFIN_MB_URL), loadHtml(MINFIN_EUR_MB_URL)]);

  const usdFallbackRates = extractRatesFromWidgetJson(usdHtml) ?? extractRatesFromText(usdHtml);
  const eurFallbackRates = extractRatesFromWidgetJson(eurHtml) ?? extractRatesFromText(eurHtml);
  const usd = extractRateFromJsonLd(usdHtml, "USD") ?? extractCurrencyRate(usdHtml, "USD") ?? usdFallbackRates?.usd ?? null;
  const eur = extractRateFromJsonLd(eurHtml, "EUR") ?? extractCurrencyRate(eurHtml, "EUR") ?? eurFallbackRates?.eur ?? null;
  if (!usd || !eur) {
    throw new Error("Failed to parse USD/EUR rates from Minfin interbank page");
  }

  return {
    source: "minfin_site_mb",
    sourceUrl: MINFIN_MB_URL,
    updatedAtLabel: extractUpdatedAt(usdHtml) ?? extractUpdatedAt(eurHtml),
    fetchedAt: new Date().toISOString(),
    usd,
    eur,
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod && event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    return jsonResponse(200, await loadMinfinRates());
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unknown error",
      source: "minfin_site_mb",
      sourceUrl: MINFIN_MB_URL,
    });
  }
};
