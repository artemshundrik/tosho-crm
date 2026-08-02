/**
 * Дрібні помічники для файлів у чаті: людські імена для скріншотів із буфера
 * і перетворення масиву назад у FileList, який чекає завантажувач сторінки.
 */

/**
 * Скріншот із буфера приходить з іменем на кшталт "image.png" — завжди
 * однаковим. Без перейменування у «Файлах» назбирується десяток однакових
 * назв, які потім неможливо розрізнити.
 */
export function withReadableName(file: File): File {
  const generic = !file.name || /^(image|screenshot|знімок)[\s._-]*\d*\.[a-z]+$/i.test(file.name);
  if (!generic) return file;
  const stamp = new Date()
    .toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(/[^\d.:]+/g, "-");
  const extension = file.name.split(".").pop() || (file.type.split("/")[1] ?? "png");
  return new File([file], `Скріншот ${stamp}.${extension}`, { type: file.type });
}

export function toFileList(files: File[]): FileList {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  return transfer.files;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
