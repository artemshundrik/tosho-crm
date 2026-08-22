import { toast } from "sonner";

import { convertWebpBlobForSharing, isWebpBlob, swapFilenameExtension } from "@/lib/imageConversion";

// Та сама логіка, що в getErrorMessage із quote-details/config: текст помилки
// в тості має лишитись дослівно таким, як був. Копія, а не імпорт, бо
// загальний lib не має залежати від окремої фічі.
const errorText = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

/**
 * Завантажити файл на пристрій за посиланням.
 *
 * ЧОМУ НЕ В ТІЛІ СТОРІНКИ. Функція нічого не знає про стан компонента — у
 * картці прорахунку вона й стояла як `useCallback` зі списком залежностей `[]`.
 * Але `try/catch` із «||» усередині React Compiler не вміє, тож поки вона жила
 * в компоненті, він пропускав усю сторінку — а разом із ним замовкали правила
 * лінту для хуків (REQ-109). На рівні модуля `try` нікому не заважає.
 *
 * WebP переганяємо в JPEG (або PNG, якщо є прозорість): Telegram під Windows
 * читає WebP-байти як стікер, хоч би що казало розширення у назві.
 * Див. src/lib/imageConversion.ts.
 */
export async function downloadFileToDevice(url: string, filename?: string | null): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      toast.error("Не вдалося завантажити файл", { description: `HTTP ${response.status}` });
      return;
    }

    let blob = await response.blob();
    let outputFilename = (filename && filename.trim()) || "file";

    if (isWebpBlob(blob)) {
      try {
        const converted = await convertWebpBlobForSharing(blob);
        blob = converted.blob;
        outputFilename = swapFilenameExtension(outputFilename, converted.extension);
      } catch (conversionError) {
        console.warn(
          "Failed to convert WebP attachment for sharing, falling back to raw bytes",
          conversionError
        );
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = outputFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    toast.error("Не вдалося завантажити файл", {
      description: errorText(error, "Спробуйте ще раз."),
    });
  }
}
