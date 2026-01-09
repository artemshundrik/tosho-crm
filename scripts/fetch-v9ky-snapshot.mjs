import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_URL =
  "https://v9ky.in.ua/2025-26_Zyma_Kyiv_Gold_League_Futsal?first_day=2025-12-27&last_day=0";
const OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "snapshots",
  "v9ky-gold-league.html",
);

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function main() {
  const response = await fetch(SNAPSHOT_URL, {
    headers: {
      "User-Agent": userAgent,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, html, "utf-8");

  console.log(`Saved snapshot to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
