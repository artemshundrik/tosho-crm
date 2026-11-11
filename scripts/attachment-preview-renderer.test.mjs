import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderFirstPagePreviewFiles } from "./attachment-preview-renderer.mjs";

/**
 * На Netlify немає ні ImageMagick, ні sips, ні QuickLook — лише Node і sharp.
 * Поки рендерер шукав зовнішні утиліти, кожен TIFF на проді падав із «No supported
 * TIFF preview renderer», а на Маку все працювало через sips, тож у розробці баг
 * був невидимий. Порожній PATH відтворює саме продове оточення.
 */
describe("renderFirstPagePreviewFiles — TIFF без системних утиліт", () => {
  let tempDir;
  let originalPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preview-renderer-test-"));
    originalPath = process.env.PATH;
    process.env.PATH = path.join(tempDir, "no-tools-here");
  });

  afterEach(async () => {
    process.env.PATH = originalPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("робить прев'ю і мініатюру у WebP, зменшені до своїх меж", async () => {
    // Білий логотип на прозорому тлі, LZW — типовий експорт із Photoshop.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="600">' +
      '<rect x="100" y="150" width="2200" height="300" rx="40" fill="#ffffff"/></svg>';
    const inputPath = path.join(tempDir, "logo.tif");
    await sharp(Buffer.from(svg)).tiff({ compression: "lzw" }).toFile(inputPath);

    const result = await renderFirstPagePreviewFiles(inputPath);

    expect(result.contentType).toBe("image/webp");
    expect(result.extension).toBe("webp");
    const preview = await sharp(result.previewBuffer).metadata();
    const thumb = await sharp(result.thumbBuffer).metadata();
    expect(preview.format).toBe("webp");
    expect(Math.max(preview.width ?? 0, preview.height ?? 0)).toBe(960);
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(160);
    // Прозорість лишається: білий логотип на білій підкладці інакше зник би.
    expect(preview.hasAlpha).toBe(true);
  });

  it("не збільшує маленький TIFF", async () => {
    const inputPath = path.join(tempDir, "small.tiff");
    await sharp({ create: { width: 120, height: 80, channels: 3, background: "#336699" } })
      .tiff()
      .toFile(inputPath);

    const result = await renderFirstPagePreviewFiles(inputPath);
    const preview = await sharp(result.previewBuffer).metadata();

    expect(preview.width).toBe(120);
    expect(preview.height).toBe(80);
  });
});
