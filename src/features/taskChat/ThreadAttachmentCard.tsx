import React from "react";
import { FileText, ImageOff } from "lucide-react";
import { getSignedAttachmentUrl, isRasterPreviewableFile } from "@/lib/attachmentPreview";
import type { ThreadAttachment } from "@/lib/taskThread";
import { cn } from "@/lib/utils";

const formatSize = (bytes: number | null) => {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

/**
 * Файл у бабблі: картинка — прев'ю, решта — картка з іконкою.
 *
 * Посилання підписані й короткоживучі, тому беремо їх через спільний
 * `getSignedAttachmentUrl` з його кешем, а не робимо власні запити на кожен
 * рендер стрічки.
 */
export function ThreadAttachmentCard({
  attachment,
  own,
}: {
  attachment: ThreadAttachment;
  own: boolean;
}) {
  const isImage = React.useMemo(
    () => isRasterPreviewableFile({ type: attachment.mimeType ?? "", name: attachment.fileName }),
    [attachment.mimeType, attachment.fileName]
  );

  const [url, setUrl] = React.useState<string | null>(null);
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!attachment.bucket || !attachment.path) return;
    void getSignedAttachmentUrl(attachment.bucket, attachment.path, isImage ? "preview" : "original")
      .then((signed) => {
        if (alive) setUrl(signed);
      })
      .catch(() => {
        if (alive) setBroken(true);
      });
    return () => {
      alive = false;
    };
  }, [attachment.bucket, attachment.path, isImage]);

  const size = formatSize(attachment.fileSize);
  const subtle = own ? "text-primary-foreground/75" : "text-muted-foreground";

  if (isImage && !broken) {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block overflow-hidden rounded-xl border border-border/30 bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {url ? (
          <img
            src={url}
            alt={attachment.fileName}
            loading="lazy"
            onError={() => setBroken(true)}
            className="max-h-52 w-full object-cover"
          />
        ) : (
          <span className="flex h-28 w-full animate-pulse items-center justify-center bg-muted" />
        )}
        <span className={cn("flex items-center gap-1.5 px-2 py-1 text-3xs", subtle)}>
          <span className="truncate font-medium">{attachment.fileName}</span>
          {size ? <span className="shrink-0 tabular-nums opacity-80">· {size}</span> : null}
        </span>
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-1 flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors",
        own
          ? "border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border/50 bg-background/70 hover:bg-muted/60"
      )}
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          own ? "bg-primary-foreground/15" : "bg-muted"
        )}
      >
        {broken ? <ImageOff className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-2xs font-medium">{attachment.fileName}</span>
        {size ? <span className={cn("text-3xs tabular-nums", subtle)}>{size}</span> : null}
      </span>
    </a>
  );
}
