import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSignedAttachmentUrl,
  isServerPreviewableStoragePath,
  waitForSignedAttachmentUrl,
  type AttachmentPreviewVariant,
} from "@/lib/attachmentPreview";

type StorageObjectImageProps = {
  bucket?: string | null;
  path?: string | null;
  alt: string;
  variant?: AttachmentPreviewVariant;
  className?: string;
  imageClassName?: string;
  hoverPreview?: boolean;
};

export function StorageObjectImage({
  bucket,
  path,
  alt,
  variant = "thumb",
  className,
  imageClassName,
  hoverPreview = false,
}: StorageObjectImageProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failedVariant, setFailedVariant] = useState(false);
  const [hoverSrc, setHoverSrc] = useState<string | null>(null);
  const [hoverFailed, setHoverFailed] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [previewBounds, setPreviewBounds] = useState({
    top: 0,
    left: 0,
    width: 224,
    height: 224,
  });

  const previewHeight = 224;
  const previewMaxWidth = 420;
  const previewGap = 10;
  const viewportPadding = 12;
  const previewWidth = Math.max(120, Math.min(previewMaxWidth, Math.round(previewHeight * previewAspectRatio)));

  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    const rect = anchor.getBoundingClientRect();
    const availableRight = Math.max(0, window.innerWidth - rect.right - viewportPadding - previewGap);
    const availableLeft = Math.max(0, rect.left - viewportPadding - previewGap);

    const shouldOpenLeft = availableRight < previewWidth && availableLeft > availableRight;
    const activeAvailableWidth = shouldOpenLeft ? availableLeft : availableRight;
    const clampedWidth = Math.min(previewWidth, Math.max(1, activeAvailableWidth || previewWidth));

    const centeredTop = rect.top + rect.height / 2 - previewHeight / 2;
    const centeredBottom = centeredTop + previewHeight;
    let top = centeredTop;
    if (!(centeredTop >= viewportPadding && centeredBottom <= window.innerHeight - viewportPadding)) {
      const upTop = rect.bottom - previewHeight;
      top = upTop >= viewportPadding ? upTop : rect.top;
    }
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewHeight - viewportPadding));

    let left = shouldOpenLeft ? rect.left - previewGap - clampedWidth : rect.right + previewGap;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - clampedWidth - viewportPadding));

    setPreviewBounds({
      top,
      left,
      width: clampedWidth,
      height: previewHeight,
    });
  }, [previewWidth]);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailedVariant(false);
    if (!bucket || !path) return;

    const load = async () => {
      const nextUrl =
        variant !== "original" && isServerPreviewableStoragePath(path)
          ? await waitForSignedAttachmentUrl(bucket, path, variant, { queueServerPreview: true })
          : await getSignedAttachmentUrl(bucket, path, variant);
      if (!active) return;
      setSrc(nextUrl ?? null);
    };

    void load();
    return () => {
      active = false;
    };
  }, [bucket, path, variant]);

  useEffect(() => {
    if (!hoverOpen) return;
    const handleViewportChange = () => updatePlacement();
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [hoverOpen, updatePlacement]);

  const ensureHoverSrc = useCallback(async () => {
    if (!hoverPreview || hoverSrc || hoverFailed || !bucket || !path) return;
    const nextUrl = isServerPreviewableStoragePath(path)
      ? await waitForSignedAttachmentUrl(bucket, path, "preview", { queueServerPreview: true })
      : await getSignedAttachmentUrl(bucket, path, "preview");
    if (nextUrl) {
      setHoverSrc(nextUrl);
      return;
    }
    setHoverFailed(true);
  }, [bucket, hoverFailed, hoverPreview, hoverSrc, path]);

  return (
    <div
      ref={anchorRef}
      className={cn("grid place-items-center overflow-hidden bg-muted/20", className)}
      onMouseEnter={() => {
        if (!hoverPreview) return;
        void ensureHoverSrc();
        updatePlacement();
        setHoverOpen(true);
      }}
      onMouseLeave={() => setHoverOpen(false)}
      onFocus={() => {
        if (!hoverPreview) return;
        void ensureHoverSrc();
        updatePlacement();
        setHoverOpen(true);
      }}
      onBlur={() => setHoverOpen(false)}
      tabIndex={hoverPreview ? 0 : undefined}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-contain", imageClassName)}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (failedVariant) return;
            setFailedVariant(true);
            setSrc(null);
          }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (!naturalWidth || !naturalHeight) return;
            setPreviewAspectRatio(naturalWidth / naturalHeight);
          }}
        />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
      )}
      {hoverOpen && hoverSrc && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[90] hidden overflow-hidden rounded-[14px] border border-border/70 bg-card shadow-[var(--shadow-elevated-preview)] opacity-100 scale-100 md:block"
              style={{
                top: `${previewBounds.top}px`,
                left: `${previewBounds.left}px`,
                width: `${previewBounds.width}px`,
                height: `${previewBounds.height}px`,
              }}
            >
              <img
                src={hoverSrc}
                alt=""
                className="h-full w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
