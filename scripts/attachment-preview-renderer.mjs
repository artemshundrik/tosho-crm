import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const COMMAND_TIMEOUT_MS = 60_000;
const PREVIEW_MAX_SIZE = 960;
const THUMB_MAX_SIZE = 160;

async function runCommand(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${COMMAND_TIMEOUT_MS}ms`));
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function findExecutable(name) {
  try {
    const { stdout } = await runCommand("which", [name]);
    const resolved = stdout.trim();
    return resolved || null;
  } catch {
    return null;
  }
}

async function findGeneratedPreviewPng(outputDir) {
  const entries = await fs.readdir(outputDir);
  const pngs = entries.filter((entry) => entry.toLowerCase().endsWith(".png")).sort();
  if (pngs.length === 0) return null;
  return path.join(outputDir, pngs[pngs.length - 1]);
}

function getOutputPrefix(outputPath) {
  return outputPath.replace(/\.[^.]+$/i, "");
}

async function renderWithQuickLook(qlmanage, inputPath, previewPath, tempDir) {
  await runCommand(qlmanage, ["-t", "-s", String(PREVIEW_MAX_SIZE), "-o", tempDir, inputPath]);
  const generated = await findGeneratedPreviewPng(tempDir);
  if (!generated) {
    throw new Error("QuickLook did not generate preview png");
  }
  if (generated !== previewPath) {
    await fs.copyFile(generated, previewPath);
  }
}

async function renderWithPdfToPpm(pdftoppm, inputPath, previewPath) {
  await runCommand(pdftoppm, ["-f", "1", "-singlefile", "-scale-to", String(PREVIEW_MAX_SIZE), "-png", inputPath, getOutputPrefix(previewPath)]);
}

async function renderWithImageMagick(command, inputPath, previewPath) {
  const source = /\.(pdf|tif|tiff)$/i.test(inputPath) ? `${inputPath}[0]` : inputPath;
  await runCommand(command, [source, "-resize", `${PREVIEW_MAX_SIZE}x${PREVIEW_MAX_SIZE}>`, previewPath]);
}

async function renderWithSips(sips, inputPath, previewPath) {
  await runCommand(sips, [inputPath, "-s", "format", "png", "--out", previewPath]);
  await runCommand(sips, ["-Z", String(PREVIEW_MAX_SIZE), previewPath, "--out", previewPath]);
}

async function convertPngToWebp({ magick, convert }, inputPath, outputPath) {
  if (magick) {
    await runCommand(magick, [inputPath, "-quality", "84", outputPath]);
    return true;
  }
  if (convert) {
    await runCommand(convert, [inputPath, "-quality", "84", outputPath]);
    return true;
  }
  return false;
}

async function buildThumbnail({ magick, convert, sips }, previewPath, thumbPath) {
  if (magick) {
    await runCommand(magick, [previewPath, "-resize", `${THUMB_MAX_SIZE}x${THUMB_MAX_SIZE}>`, thumbPath]);
    return;
  }
  if (convert) {
    await runCommand(convert, [previewPath, "-resize", `${THUMB_MAX_SIZE}x${THUMB_MAX_SIZE}>`, thumbPath]);
    return;
  }
  if (sips) {
    await runCommand(sips, ["-Z", String(THUMB_MAX_SIZE), previewPath, "--out", thumbPath]);
    return;
  }
  throw new Error("No supported thumbnail renderer found in environment");
}

export async function renderRasterPreviewFiles(inputPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attachment-raster-preview-"));
  const previewPath = path.join(tempDir, "preview.png");
  const thumbPath = path.join(tempDir, "thumb.png");
  const previewWebpPath = path.join(tempDir, "preview.webp");
  const thumbWebpPath = path.join(tempDir, "thumb.webp");

  try {
    const qlmanage = await findExecutable("qlmanage");
    const magick = await findExecutable("magick");
    const convert = await findExecutable("convert");
    const sips = await findExecutable("sips");

    if (magick) {
      await renderWithImageMagick(magick, inputPath, previewPath);
    } else if (convert) {
      await renderWithImageMagick(convert, inputPath, previewPath);
    } else if (sips) {
      await renderWithSips(sips, inputPath, previewPath);
    } else if (qlmanage) {
      await renderWithQuickLook(qlmanage, inputPath, previewPath, tempDir);
    } else {
      throw new Error("No supported raster preview renderer found in environment");
    }

    await buildThumbnail({ magick, convert, sips }, previewPath, thumbPath);

    const useWebp =
      (await convertPngToWebp({ magick, convert }, previewPath, previewWebpPath)) &&
      (await convertPngToWebp({ magick, convert }, thumbPath, thumbWebpPath));

    const [previewBuffer, thumbBuffer] = await Promise.all([
      fs.readFile(useWebp ? previewWebpPath : previewPath),
      fs.readFile(useWebp ? thumbWebpPath : thumbPath),
    ]);

    return {
      previewBuffer,
      thumbBuffer,
      contentType: useWebp ? "image/webp" : "image/png",
      extension: useWebp ? "webp" : "png",
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function renderFirstPagePreviewFiles(inputPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attachment-preview-"));
  const previewPath = path.join(tempDir, "preview.png");
  const thumbPath = path.join(tempDir, "thumb.png");
  const previewWebpPath = path.join(tempDir, "preview.webp");
  const thumbWebpPath = path.join(tempDir, "thumb.webp");

  try {
    const qlmanage = await findExecutable("qlmanage");
    const pdftoppm = await findExecutable("pdftoppm");
    const magick = await findExecutable("magick");
    const convert = await findExecutable("convert");
    const sips = await findExecutable("sips");
    const lowerInputPath = inputPath.toLowerCase();
    const isPdf = lowerInputPath.endsWith(".pdf");
    const isTiff = lowerInputPath.endsWith(".tif") || lowerInputPath.endsWith(".tiff");

    if (isPdf) {
      if (pdftoppm) {
        await renderWithPdfToPpm(pdftoppm, inputPath, previewPath);
      } else if (magick) {
        await renderWithImageMagick(magick, inputPath, previewPath);
      } else if (convert) {
        await renderWithImageMagick(convert, inputPath, previewPath);
      } else if (qlmanage) {
        await renderWithQuickLook(qlmanage, inputPath, previewPath, tempDir);
      } else {
        throw new Error("No supported PDF preview renderer found in environment");
      }
    } else if (isTiff) {
      if (magick) {
        await renderWithImageMagick(magick, inputPath, previewPath);
      } else if (convert) {
        await renderWithImageMagick(convert, inputPath, previewPath);
      } else if (sips) {
        await renderWithSips(sips, inputPath, previewPath);
      } else if (qlmanage) {
        await renderWithQuickLook(qlmanage, inputPath, previewPath, tempDir);
      } else {
        throw new Error("No supported TIFF preview renderer found in environment");
      }
    } else {
      throw new Error("Unsupported source file extension");
    }

    await buildThumbnail({ magick, convert, sips }, previewPath, thumbPath);

    const useWebp =
      (await convertPngToWebp({ magick, convert }, previewPath, previewWebpPath)) &&
      (await convertPngToWebp({ magick, convert }, thumbPath, thumbWebpPath));

    const [previewBuffer, thumbBuffer] = await Promise.all([
      fs.readFile(useWebp ? previewWebpPath : previewPath),
      fs.readFile(useWebp ? thumbWebpPath : thumbPath),
    ]);

    return {
      previewBuffer,
      thumbBuffer,
      contentType: useWebp ? "image/webp" : "image/png",
      extension: useWebp ? "webp" : "png",
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
