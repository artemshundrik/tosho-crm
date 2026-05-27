import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";

type StorageObjectVideoProps = {
  bucket?: string | null;
  path?: string | null;
  className?: string;
  /** Optional click handler — typically opens the full preview overlay. */
  onClick?: () => void;
  /** Accessible label / title for the tile. */
  label?: string;
};

/**
 * Compact video tile for design output / attachment lists. Renders the first
 * frame of an mp4/mov by loading metadata only, then overlays a play icon.
 * Click delegates to the parent (usually opens the full-screen preview).
 */
export function StorageObjectVideo({ bucket, path, className, onClick, label }: StorageObjectVideoProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSrc(null);
    if (!bucket || !path) return;
    void (async () => {
      const url = await getSignedAttachmentUrl(bucket, path, "original");
      if (!active) return;
      setSrc(url ?? null);
    })();
    return () => {
      active = false;
    };
  }, [bucket, path]);

  return (
    <div
      className={cn("relative grid place-items-center overflow-hidden bg-black/40", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={label}
    >
      {src ? (
        <video
          src={src}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      ) : null}
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
        <Play className="h-3.5 w-3.5 text-white drop-shadow" fill="currentColor" />
      </span>
    </div>
  );
}
