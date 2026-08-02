import React from "react";
import { Download, FileText, ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  const [previewOpen, setPreviewOpen] = React.useState(false);

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
      <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="my-0.5 block w-full overflow-hidden rounded-xl border border-border/30 bg-muted/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
      </button>
      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        attachment={attachment}
        url={url}
        size={size}
        isImage
      />
      </>
    );
  }

  return (
    <>
    <button
      type="button"
      onClick={() => setPreviewOpen(true)}
      className={cn(
        "my-0.5 flex w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors",
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
    </button>
    <PreviewDialog
      open={previewOpen}
      onOpenChange={setPreviewOpen}
      attachment={attachment}
      url={url}
      size={size}
      isImage={false}
    />
    </>
  );
}

/** Перегляд файлу поверх сторінки: клік у стрічці не має нікуди вести. */
function PreviewDialog({
  open,
  onOpenChange,
  attachment,
  url,
  size,
  isImage,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  attachment: ThreadAttachment;
  url: string | null;
  size: string | null;
  isImage: boolean;
}) {
  // У стрічці показується зменшений варіант; для перегляду тягнемо оригінал —
  // але лише коли модалку відкрили, щоб не гріти сховище дарма.
  const [fullUrl, setFullUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !attachment.bucket || !attachment.path) return;
    let alive = true;
    void getSignedAttachmentUrl(attachment.bucket, attachment.path, "original")
      .then((signed) => {
        if (alive && signed) setFullUrl(signed);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, attachment.bucket, attachment.path]);

  const source = fullUrl ?? url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-fit max-w-[min(96vw,1100px)] gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <DialogTitle className="truncate text-sm">{attachment.fileName}</DialogTitle>
            {size ? <span className="text-2xs tabular-nums text-muted-foreground">{size}</span> : null}
          </span>
          {source ? (
            <a
              href={source}
              download={attachment.fileName}
              className="ml-auto mr-8 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-medium transition-colors hover:bg-muted/60"
            >
              <Download className="h-3.5 w-3.5" />
              Завантажити
            </a>
          ) : null}
        </div>

        {isImage && source ? (
          <div className="flex max-h-[calc(92vh-58px)] items-center justify-center overflow-auto bg-muted/30 p-2">
            <img src={source} alt={attachment.fileName} className="max-h-[calc(92vh-74px)] w-auto object-contain" />
          </div>
        ) : (
          <div className="flex min-w-[320px] flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
              <FileText className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Попередній перегляд недоступний</span>
            <span className="max-w-[36ch] text-xs text-muted-foreground">
              Такий тип файлу браузер не показує — завантажте його кнопкою вгорі.
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
