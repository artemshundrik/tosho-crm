import { cn } from "@/lib/utils";

/** «https://www.example.com.ua/» → «example.com.ua». Невалідну адресу віддає як є. */
export function siteHostLabel(url: string) {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Сайт компанії в таблицях і картках: лише домен, тихим текстом. Повна
 * адреса з протоколом і синім підкресленням тягнула погляд у кожному рядку.
 */
export function ExternalSiteLink({ url, className }: { url: string; className?: string }) {
  return (
    <a
      href={/^https?:\/\//i.test(url) ? url : `https://${url}`}
      target="_blank"
      rel="noreferrer"
      title={url}
      onClick={(event) => event.stopPropagation()}
      className={cn("truncate text-muted-foreground underline-offset-2 hover:text-foreground hover:underline", className)}
    >
      {siteHostLabel(url)}
    </a>
  );
}
