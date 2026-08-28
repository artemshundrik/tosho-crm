/**
 * Перетягування у форму дизайн-задачі: витягти з `DataTransfer` справжні файли.
 *
 * Винесено з DesignPage — сторінка впирається в стелю розміру, а тут немає ні
 * React, ні стану: чисті функції над браузерним API. Firefox не кладе у
 * `dataTransfer.files` картинку, перетягнуту з іншої вкладки, — тому поруч із
 * файлами розбираються ще й текстові типи (`DownloadURL`, `text/html`,
 * `text/uri-list`), звідки дістаються адреси й довантажуються самі.
 */

export const getDroppedString = (item: DataTransferItem) =>
  new Promise<string>((resolve) => {
    item.getAsString((value) => resolve(value ?? ""));
  });

export const getExtensionFromMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
};

export const extractImageUrlsFromDropText = (value: string, mimeType: string) => {
  const urls = new Set<string>();
  if (!value.trim()) return [];

  if (mimeType === "text/html") {
    const doc = new DOMParser().parseFromString(value, "text/html");
    doc.querySelectorAll("img, a, source").forEach((node) => {
      ["src", "href", "data-src", "data-original", "data-url"].forEach((attribute) => {
        const raw = node.getAttribute(attribute);
        if (raw) urls.add(raw);
      });
      const srcset = node.getAttribute("srcset");
      if (srcset) {
        srcset.split(",").forEach((entry) => {
          const raw = entry.trim().split(/\s+/)[0];
          if (raw) urls.add(raw);
        });
      }
    });
    doc.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
      const style = node.getAttribute("style") ?? "";
      Array.from(style.matchAll(/url\((["']?)(.*?)\1\)/gi)).forEach((match) => {
        if (match[2]) urls.add(match[2]);
      });
    });
  }

  if (mimeType === "DownloadURL") {
    const match = value.match(/(?:https?:\/\/|blob:|data:image\/).+$/i);
    if (match?.[0]) urls.add(match[0]);
  }

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      Array.from(line.matchAll(/(?:https?:\/\/|blob:|data:image\/)[^\s"'<>\\)]+/gi)).forEach((match) => {
        if (match[0]) urls.add(match[0]);
      });
    });

  return Array.from(urls).map((url) => url.replace(/&amp;/g, "&"));
};

export const createFileFromDroppedUrl = async (url: string, index: number) => {
  if (!/^(https?:\/\/|blob:|data:image\/)/i.test(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    const mimeType = blob.type || response.headers.get("content-type") || "application/octet-stream";
    if (!mimeType.startsWith("image/")) return null;
    let baseName = `dropped-image-${index + 1}`;
    try {
      const parsed = new URL(url);
      const lastPathPart = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
      if (lastPathPart) baseName = lastPathPart.replace(/[^\p{L}\p{N}._-]+/gu, "-");
    } catch {
      // Data URLs do not have a useful path.
    }
    const hasExtension = /\.[a-z0-9]{2,5}$/i.test(baseName);
    const fileName = hasExtension ? baseName : `${baseName}.${getExtensionFromMime(mimeType)}`;
    return new File([blob], fileName, { type: mimeType });
  } catch {
    return null;
  }
};

export const getTransferData = (dataTransfer: DataTransfer, type: string) => {
  try {
    return dataTransfer.getData(type);
  } catch {
    return "";
  }
};
