import path from "path";
import { readFileSync, promises as fs } from "fs";
import os from "os";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createClient } from "@supabase/supabase-js";
import { renderFirstPagePreviewFiles } from "./scripts/attachment-preview-renderer.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const MINFIN_MB_URL = "https://minfin.com.ua/ua/currency/mb/";
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version?: string;
};

type DevJsonResponse = {
  statusCode: number;
  body: Record<string, unknown>;
};

function sendJson(res: import("http").ServerResponse, statusCode: number, body: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: import("http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function generateAttachmentPreviewLocally(req: import("http").IncomingMessage): Promise<DevJsonResponse> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return { statusCode: 500, body: { error: "Missing Supabase env vars" } };
  }

  const authHeader = req.headers.authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return { statusCode: 401, body: { error: "Missing Authorization token" } };

  let payload: Record<string, unknown>;
  try {
    payload = await readJsonBody(req);
  } catch {
    return { statusCode: 400, body: { error: "Invalid JSON body" } };
  }

  const bucket = typeof payload.bucket === "string" ? payload.bucket.trim() : "";
  const storagePath = typeof payload.storagePath === "string" ? payload.storagePath.trim() : "";
  if (!bucket || !storagePath) {
    return { statusCode: 400, body: { error: "Missing bucket or storagePath" } };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return { statusCode: 401, body: { error: "Unauthorized" } };
  }

  const extension = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "tif", "tiff"].includes(extension)) {
    return { statusCode: 200, body: { success: true, skipped: true, reason: "unsupported-extension" } };
  }

  const { data: fileBlob, error: downloadError } = await adminClient.storage.from(bucket).download(storagePath);
  if (downloadError || !fileBlob) {
    return { statusCode: 404, body: { error: "Failed to download source file" } };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attachment-preview-src-"));
  const inputPath = path.join(tempDir, path.basename(storagePath));
  try {
    await fs.writeFile(inputPath, Buffer.from(await fileBlob.arrayBuffer()));
    const rendered = await renderFirstPagePreviewFiles(inputPath);
    const basename = storagePath.replace(/\.[^.]+$/u, "");
    const previewPath = `${basename}__preview.${rendered.extension}`;
    const thumbPath = `${basename}__thumb.${rendered.extension}`;

    const [{ error: previewError }, { error: thumbError }] = await Promise.all([
      adminClient.storage.from(bucket).upload(previewPath, rendered.previewBuffer, {
        upsert: true,
        contentType: rendered.contentType,
        cacheControl: "31536000, immutable",
      }),
      adminClient.storage.from(bucket).upload(thumbPath, rendered.thumbBuffer, {
        upsert: true,
        contentType: rendered.contentType,
        cacheControl: "31536000, immutable",
      }),
    ]);

    if (previewError) throw previewError;
    if (thumbError) throw thumbError;

    return {
      statusCode: 200,
      body: {
        success: true,
        bucket,
        storagePath,
        previewPath,
        thumbPath,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: error instanceof Error ? error.message : "Failed to generate preview",
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

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
  const fallbackRates = extractRatesFromText(html);
  const usd = extractCurrencyRate(html, "USD") ?? fallbackRates?.usd ?? null;
  const eur = extractCurrencyRate(html, "EUR") ?? fallbackRates?.eur ?? null;
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
  const manualChunks = (id: string) => {
    if (!id.includes("node_modules")) return undefined;

    if (id.includes("pdfjs-dist")) return "vendor-pdf";
    if (id.includes("@supabase/")) return "vendor-supabase";
    if (id.includes("date-fns")) return "vendor-date";
    return undefined;
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
    command === "serve"
      ? {
          name: "dev-attachment-preview-generate",
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url !== "/.netlify/functions/attachment-preview-generate") return next();
              if (req.method === "OPTIONS") {
                sendJson(res, 204, {});
                return;
              }
              if (req.method !== "POST") {
                sendJson(res, 405, { error: "Method Not Allowed" });
                return;
              }

              try {
                const response = await generateAttachmentPreviewLocally(req);
                sendJson(res, response.statusCode, response.body);
              } catch (error) {
                sendJson(res, 500, {
                  error: error instanceof Error ? error.message : "Failed to generate preview",
                });
              }
            });
          },
        }
      : undefined,
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
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
