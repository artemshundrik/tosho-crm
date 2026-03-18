import * as React from "react";
import { Eye, Users } from "lucide-react";
import { AvatarBase } from "@/components/app/avatar-kit";
import { AppDropdown } from "@/components/app/AppDropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspacePresenceEntry } from "@/hooks/useWorkspacePresenceState";

type PresenceAvatarStackProps = {
  entries: WorkspacePresenceEntry[];
  max?: number;
  size?: number;
};

export function PresenceAvatarStack({ entries, max = 5, size = 24 }: PresenceAvatarStackProps) {
  const visible = entries.slice(0, max);
  const hidden = entries.length - visible.length;

  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">0</span>;
  }

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((entry) => (
          <div key={entry.userId} className="relative">
            <AvatarBase
              src={entry.avatarUrl}
              name={entry.displayName}
              fallback={entry.displayName.slice(0, 2).toUpperCase()}
              size={size}
              className="border-background shadow-sm"
              fallbackClassName="text-[10px] font-semibold"
            />
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <span className="ml-2 text-xs font-semibold text-muted-foreground">+{hidden}</span>
      ) : null}
    </div>
  );
}

type OnlineNowDropdownProps = {
  entries: WorkspacePresenceEntry[];
  loading?: boolean;
  compact?: boolean;
};

const ONLINE_LIST_VISIBLE_ROWS = 6;
const ONLINE_LIST_ROW_HEIGHT_PX = 60;

export function OnlineNowDropdown({ entries, loading, compact = false }: OnlineNowDropdownProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const dropdownBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = React.useState(false);
  const [showBottomFade, setShowBottomFade] = React.useState(false);
  const needsScroll = !loading && entries.length > ONLINE_LIST_VISIBLE_ROWS;

  const updateScrollHints = React.useCallback(() => {
    const node = listRef.current;
    if (!node) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }
    const maxScrollTop = node.scrollHeight - node.clientHeight;
    if (maxScrollTop <= 1) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }
    setShowTopFade(node.scrollTop > 2);
    setShowBottomFade(node.scrollTop < maxScrollTop - 2);
  }, []);

  const handleListWheel = React.useCallback((event: WheelEvent) => {
    const node = listRef.current;
    if (!node || !needsScroll) return;

    const maxScrollTop = node.scrollHeight - node.clientHeight;
    if (maxScrollTop <= 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, node.scrollTop + event.deltaY));
    if (nextScrollTop !== node.scrollTop) {
      node.scrollTop = nextScrollTop;
      updateScrollHints();
    }

    event.preventDefault();
    event.stopPropagation();
  }, [needsScroll, updateScrollHints]);

  React.useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = 0;
    updateScrollHints();
  }, [entries.length, loading, updateScrollHints]);

  React.useEffect(() => {
    const bodyNode = dropdownBodyRef.current;
    if (!bodyNode) return;

    const stopWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    bodyNode.addEventListener("wheel", stopWheel, { passive: false });
    return () => {
      bodyNode.removeEventListener("wheel", stopWheel);
    };
  }, []);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.addEventListener("wheel", handleListWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleListWheel);
    };
  }, [handleListWheel]);

  return (
    <AppDropdown
      align="end"
      sideOffset={10}
      contentClassName="w-[320px]"
      trigger={
        <Button
          type="button"
          variant="control"
          size="iconMd"
          className={cn("w-auto", compact ? "gap-1.5 px-2" : "gap-2 px-2.5")}
          title="Хто онлайн"
          aria-label="Хто онлайн"
        >
          {!compact ? <Users className="h-4.5 w-4.5" /> : null}
          <PresenceAvatarStack entries={entries} max={compact ? 2 : 3} size={compact ? 18 : 20} />
        </Button>
      }
      content={
        <div
          ref={dropdownBodyRef}
          className="py-1"
        >
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Онлайн зараз ({entries.length})
          </div>
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Оновлення...</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Наразі нікого онлайн.</div>
          ) : (
            <div className="relative">
              <div
                ref={listRef}
                className={cn(
                  "overscroll-contain",
                  needsScroll ? "overflow-y-auto" : "overflow-hidden"
                )}
                style={needsScroll ? { maxHeight: `${ONLINE_LIST_VISIBLE_ROWS * ONLINE_LIST_ROW_HEIGHT_PX}px` } : undefined}
                onWheelCapture={(event) => event.stopPropagation()}
                onScroll={updateScrollHints}
              >
                {entries.map((entry) => (
                  <div key={entry.userId} className="flex items-center gap-2 px-3 py-2">
                    <AvatarBase
                      src={entry.avatarUrl}
                      name={entry.displayName}
                      fallback={entry.displayName.slice(0, 2).toUpperCase()}
                      size={28}
                      className="border-border"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {entry.displayName}
                        {entry.isSelf ? " (ви)" : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {entry.currentLabel ?? entry.currentPath ?? "У CRM"}
                      </div>
                    </div>
                    <span className={cn("h-2.5 w-2.5 rounded-full", entry.online ? "bg-emerald-400" : "bg-amber-400")} />
                  </div>
                ))}
              </div>
              {needsScroll && showTopFade ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-popover to-transparent" />
              ) : null}
              {needsScroll && showBottomFade ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-popover to-transparent" />
              ) : null}
            </div>
          )}
        </div>
      }
    />
  );
}

type ActiveHereCardProps = {
  entries: WorkspacePresenceEntry[];
  className?: string;
  title?: string;
  variant?: "default" | "minimal";
};

export function ActiveHereCard({
  entries,
  className,
  title = "Активні тут",
  variant = "default",
}: ActiveHereCardProps) {
  if (variant === "minimal") {
    return (
      <div className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        {entries.length === 0 ? <span className="text-xs text-muted-foreground">0</span> : <PresenceAvatarStack entries={entries} max={4} size={20} />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5",
        className
      )}
    >
      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">{title}:</span>
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">0</span>
      ) : (
        <PresenceAvatarStack entries={entries} max={4} size={20} />
      )}
      {entries.length > 0 ? (
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      ) : null}
    </div>
  );
}

type EntityViewersBarProps = {
  entries: WorkspacePresenceEntry[];
  className?: string;
  label?: string;
};

export function EntityViewersBar({ entries, className, label = "Зараз дивляться" }: EntityViewersBarProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Eye className="h-3.5 w-3.5" />
      <span>{label}:</span>
      <PresenceAvatarStack entries={entries} max={5} size={20} />
    </div>
  );
}
