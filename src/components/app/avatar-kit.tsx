import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { getCachedAvatarDisplayUrl, getImmediateAvatarDisplayUrl, resolveAvatarDisplayUrl, type AvatarAssetVariant } from "@/lib/avatarUrl";
import {
  buildTeamStatusTitle,
  getTeamAvailabilityAvatarClass,
  getTeamStatusIndicatorClass,
  type TeamAvailabilityStatus,
  type TeamPresenceStatus,
} from "@/lib/teamAvailability";

const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

type AvatarVariant = "xs" | "sm" | "lg" | "hero";
type AvatarShape = "circle" | "rounded";

const VARIANT_SIZES: Record<AvatarVariant, number> = {
  xs: 28,
  sm: 36,
  lg: 48,
  hero: 112,
};

export function getPlayerAvatarImageStyle(size?: number): React.CSSProperties | undefined {
  void size;
  return {
    objectPosition: "50% -70%",
    transform: "scale(1.7)",
  };
}

function getInitials(name?: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  if (!name) return "•";
  const parts = name.split(" ").filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]).join("");
  return initials.toUpperCase() || "•";
}

type AvatarBaseProps = {
  src?: string | null;
  name?: string;
  fallback?: string;
  variant?: AvatarVariant;
  assetVariant?: AvatarAssetVariant;
  size?: number;
  shape?: AvatarShape;
  className?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
  availability?: TeamAvailabilityStatus | null;
  presence?: TeamPresenceStatus | null;
  showStatusIndicator?: boolean;
};

type PlayerAvatarProps = {
  src?: string | null;
  name?: string;
  fallback?: string;
  size?: number;
  shape?: AvatarShape;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
};

type EntityAvatarProps = {
  src?: string | null;
  name?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
  fallbackClassName?: string;
};

const failedEntityAvatarSrcs = new Set<string>();

const ENTITY_AVATAR_TONES = [
  { shell: "entity-avatar-shell-tone-1", fallback: "entity-avatar-fallback-tone-1" },
  { shell: "entity-avatar-shell-tone-2", fallback: "entity-avatar-fallback-tone-2" },
  { shell: "entity-avatar-shell-tone-3", fallback: "entity-avatar-fallback-tone-3" },
  { shell: "entity-avatar-shell-tone-4", fallback: "entity-avatar-fallback-tone-4" },
  { shell: "entity-avatar-shell-tone-5", fallback: "entity-avatar-fallback-tone-5" },
  { shell: "entity-avatar-shell-tone-6", fallback: "entity-avatar-fallback-tone-6" },
];

function getEntityAvatarTone(seed?: string | null) {
  const normalized = (seed ?? "").trim().toLowerCase();
  if (!normalized) return ENTITY_AVATAR_TONES[0];
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return ENTITY_AVATAR_TONES[hash % ENTITY_AVATAR_TONES.length];
}

export function AvatarBase({
  src,
  name,
  fallback,
  variant = "sm",
  assetVariant = "xs",
  size,
  shape = "circle",
  className,
  imageClassName,
  imageStyle,
  fallbackClassName,
  loading = "lazy",
  referrerPolicy,
  availability,
  presence,
  showStatusIndicator = true,
}: AvatarBaseProps) {
  const avatarRef = React.useRef<HTMLSpanElement | null>(null);
  const [errored, setErrored] = React.useState(false);
  const [shouldResolve, setShouldResolve] = React.useState(() => loading === "eager");
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(() => {
    if (!src) return null;
    return getCachedAvatarDisplayUrl(src, assetVariant) ?? getImmediateAvatarDisplayUrl(src, AVATAR_BUCKET, assetVariant);
  });
  const mountedRef = React.useRef(true);
  const refreshAttemptedForSrcRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const computedSize = size ?? VARIANT_SIZES[variant];

  React.useEffect(() => {
    setErrored(false);
    refreshAttemptedForSrcRef.current = null;
    setShouldResolve(loading === "eager");
  }, [loading, src]);

  React.useEffect(() => {
    if (!src || shouldResolve || loading === "eager") return;
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      setShouldResolve(true);
      return;
    }

    const node = avatarRef.current;
    if (!node) {
      setShouldResolve(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldResolve(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, shouldResolve, src]);

  React.useEffect(() => {
    let active = true;
    if (!src) {
      setResolvedSrc(null);
      return () => {
        active = false;
      };
    }

    const cached = getCachedAvatarDisplayUrl(src, assetVariant);
    if (cached) {
      setResolvedSrc(cached);
      return () => {
        active = false;
      };
    }

    const immediate = getImmediateAvatarDisplayUrl(src, AVATAR_BUCKET, assetVariant);
    setResolvedSrc(immediate);
    if (!shouldResolve && !immediate) {
      return () => {
        active = false;
      };
    }

    const run = async () => {
      const next = await resolveAvatarDisplayUrl(supabase, src, AVATAR_BUCKET, { assetVariant });
      if (active) setResolvedSrc(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [assetVariant, computedSize, shouldResolve, src]);

  const initials = getInitials(name, fallback);
  const showImage = Boolean(resolvedSrc) && !errored;
  const statusTitle = buildTeamStatusTitle({ name, availability, presence });
  const statusIndicatorClass = getTeamStatusIndicatorClass({ availability, presence });
  const statusIndicatorSizeClass =
    computedSize <= 18 ? "h-2 w-2 border" : computedSize <= 28 ? "h-2.5 w-2.5 border" : "h-3 w-3 border";
  const statusIndicatorEdgeClass = "bottom-0 right-0";
  const handleImageError = React.useCallback(() => {
    if (!src) {
      setErrored(true);
      return;
    }

    if (refreshAttemptedForSrcRef.current === src) {
      setErrored(true);
      return;
    }

    refreshAttemptedForSrcRef.current = src;
    void resolveAvatarDisplayUrl(supabase, src, AVATAR_BUCKET, { forceRefresh: true, assetVariant, preferOriginal: true }).then((nextUrl) => {
      if (!mountedRef.current) return;
      if (nextUrl && nextUrl !== resolvedSrc) {
        setResolvedSrc(nextUrl);
        setErrored(false);
        return;
      }
      setErrored(true);
    });
  }, [assetVariant, resolvedSrc, src]);

  return (
    <span className="relative inline-flex shrink-0 align-middle" title={statusTitle || undefined}>
      <Avatar
        ref={avatarRef}
        className={cn(
          "border border-border/60 bg-muted/60 text-muted-foreground/80 shadow-sm dark:bg-muted/40",
          shape === "rounded" ? "rounded-[var(--radius-lg)]" : "rounded-full",
          getTeamAvailabilityAvatarClass(availability),
          className
        )}
        style={{ width: computedSize, height: computedSize }}
        onMouseEnter={() => setShouldResolve(true)}
        onFocusCapture={() => setShouldResolve(true)}
      >
        {showImage ? (
          <AvatarImage
            src={resolvedSrc ?? ""}
            alt={name || "Avatar"}
            className={cn("object-cover", imageClassName)}
            style={imageStyle}
            loading={loading}
            referrerPolicy={referrerPolicy}
            onError={handleImageError}
          />
        ) : null}
        <AvatarFallback
          className={cn(
            "text-[10px] font-semibold uppercase text-muted-foreground",
            shape === "rounded" ? "rounded-[var(--radius-lg)]" : "rounded-full",
            fallbackClassName
          )}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      {showStatusIndicator && statusIndicatorClass ? (
        <span
          className={cn(
            "absolute z-[1] rounded-full border-background",
            statusIndicatorSizeClass,
            statusIndicatorEdgeClass,
            statusIndicatorClass
          )}
        />
      ) : null}
    </span>
  );
}

export function PlayerAvatar({
  src,
  name,
  fallback,
  size = VARIANT_SIZES.sm,
  shape = "circle",
  className,
  imageClassName,
  fallbackClassName,
  loading = "lazy",
  referrerPolicy,
}: PlayerAvatarProps) {
  return (
    <AvatarBase
      src={src}
      name={name}
      fallback={fallback}
      size={size}
      shape={shape}
      className={className}
      imageClassName={imageClassName}
      fallbackClassName={fallbackClassName}
      loading={loading}
      referrerPolicy={referrerPolicy}
      imageStyle={getPlayerAvatarImageStyle(size)}
    />
  );
}

export function EntityAvatar({
  src,
  name,
  fallback,
  size = 36,
  className,
  fallbackClassName,
}: EntityAvatarProps) {
  const tone = getEntityAvatarTone(name ?? fallback ?? "");
  const rawSrc = src?.trim() || null;
  const normalizedSrc = rawSrc && rawSrc.toLowerCase().startsWith("data:") ? null : rawSrc;
  const [errored, setErrored] = React.useState(() =>
    normalizedSrc ? failedEntityAvatarSrcs.has(normalizedSrc) : false
  );
  const hasLogo = Boolean(normalizedSrc) && !errored;

  React.useEffect(() => {
    setErrored(normalizedSrc ? failedEntityAvatarSrcs.has(normalizedSrc) : false);
  }, [normalizedSrc]);

  return (
    <Avatar
      className={cn("shrink-0 border shadow-sm", hasLogo ? "border-border/60 bg-muted/20" : cn("border-border/40", tone.shell), className)}
      style={{ width: size, height: size }}
    >
      {hasLogo ? (
        <AvatarImage
          src={normalizedSrc ?? ""}
          alt={name ?? "Logo"}
          className="object-cover"
          loading="lazy"
          onError={() => {
            if (normalizedSrc) failedEntityAvatarSrcs.add(normalizedSrc);
            setErrored(true);
          }}
        />
      ) : null}
      <AvatarFallback className={cn("text-xs font-semibold", tone.fallback, fallbackClassName)}>
        {getInitials(name ?? undefined, fallback)}
      </AvatarFallback>
    </Avatar>
  );
}
