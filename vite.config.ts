import path from "path";
import { readFileSync } from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const ALLOWED_HOSTS = new Set(["v9ky.in.ua", "r-cup.com.ua", "sfck.com.ua"]);
const MINFIN_MB_URL = "https://minfin.com.ua/ua/currency/mb/";
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version?: string;
};

function parseDecimal(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function extractCurrencyRate(html: string, code: "USD" | "EUR") {
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

async function loadMinfinRates() {
  const response = await fetch(MINFIN_MB_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Minfin responded with HTTP ${response.status}`);
  }

  const html = await response.text();
  const usd = extractCurrencyRate(html, "USD");
  const eur = extractCurrencyRate(html, "EUR");
  if (!usd || !eur) {
    throw new Error("Failed to parse USD/EUR rates from Minfin interbank page");
  }

  return {
    source: "minfin_site_mb",
    sourceUrl: MINFIN_MB_URL,
    updatedAtLabel: extractUpdatedAt(html),
    fetchedAt: new Date().toISOString(),
    usd,
    eur,
  };
}

export default defineConfig(({ command }) => {
  const builtAt = new Date().toISOString();
  const appVersion = {
    version: packageJson.version ?? "0.0.0",
    buildId: `${packageJson.version ?? "0.0.0"}-${Date.now().toString(36)}`,
    builtAt,
  };

  return ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "app-version-manifest",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] !== "/version.json") return next();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.end(JSON.stringify(appVersion));
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify(appVersion, null, 2),
        });
      },
    },
    command === "serve"
      ? {
          name: "dev-fetch-v9ky-standings",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/api/fetch-v9ky-standings") return next();
              if (req.method !== "POST") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
              }

              let body = "";
              req.on("data", (chunk) => {
                body += chunk.toString();
              });
              req.on("end", async () => {
                try {
                  const payload = JSON.parse(body || "{}");
                  const url = payload?.url;
                  if (typeof url !== "string") {
                    res.statusCode = 400;
                    res.end("Missing url");
                    return;
                  }

                  const parsed = new URL(url);
                  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
                    res.statusCode = 400;
                    res.end("URL host not allowed");
                    return;
                  }

                  const response = await fetch(parsed.toString(), {
                    headers: {
                      "User-Agent": USER_AGENT,
                      Accept: "text/html,*/*",
                    },
                  });

                  if (!response.ok) {
                    res.statusCode = response.status;
                    res.end(
                      `Failed to fetch ${parsed.toString()}: ${response.status} ${response.statusText}`,
                    );
                    return;
                  }

                  const html = await response.text();
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "text/html; charset=utf-8");
                  res.end(html);
                } catch (error) {
                  res.statusCode = 500;
                  res.end(error instanceof Error ? error.message : "Unknown error");
                }
              });
            });
          },
        }
      : undefined,
    command === "serve"
      ? {
          name: "dev-minfin-fx-rates",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/api/fx-rates") return next();
              if (req.method !== "GET") {
                res.statusCode = 405;
                res.end("Method Not Allowed");
                return;
              }

              try {
                const payload = await loadMinfinRates();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.setHeader("Cache-Control", "no-store");
                res.end(JSON.stringify(payload));
              } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(
                  JSON.stringify({
                    error: error instanceof Error ? error.message : "Unknown error",
                    source: "minfin_site_mb",
                    sourceUrl: MINFIN_MB_URL,
                  })
                );
              }
            });
          },
        }
      : undefined,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
});
