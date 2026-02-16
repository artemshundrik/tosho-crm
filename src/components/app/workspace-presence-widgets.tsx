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
            {entry.online ? (
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-background bg-emerald-400" />
            ) : null}
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
};

export function OnlineNowDropdown({ entries, loading }: OnlineNowDropdownProps) {
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
          className="w-auto gap-2 px-2.5"
          title="Хто онлайн"
          aria-label="Хто онлайн"
        >
          <Users className="h-4.5 w-4.5" />
          <PresenceAvatarStack entries={entries} max={3} size={20} />
        </Button>
      }
      content={
        <div className="py-1">
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Онлайн зараз ({entries.length})
          </div>
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Оновлення...</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Наразі нікого онлайн.</div>
          ) : (
            <div className="max-h-[300px] overflow-auto">
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
};

export function ActiveHereCard({ entries, className, title = "Активні тут" }: ActiveHereCardProps) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/60 px-3 py-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{entries.length}</div>
      </div>
      <div className="mt-2">
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground">Нікого на цій сторінці зараз немає.</div>
        ) : (
          <PresenceAvatarStack entries={entries} max={6} />
        )}
      </div>
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
