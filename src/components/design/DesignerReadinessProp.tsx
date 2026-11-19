import { AvatarBase } from "@/components/app/avatar-kit";
import { EntityProp } from "@/components/app/headers/EntityHeader";
import { Check } from "@/components/icons/appIcons";
import { HoverTip } from "@/components/ui/hover-tip";
import { readDesignerReadyMap, type DesignerReadiness } from "@/lib/designTaskReadiness";
import { cn } from "@/lib/utils";

/**
 * Ряд дизайнерів у шапці спільної дизайн-задачі (REQ-365): замість
 * «Дизайнер + Співвиконавці» — усі, хто робить свою версію, і хто з них уже
 * здав. Здали — яскраві й із зеленою галочкою, чекаємо — приглушені. Підказка
 * каже, хто й коли.
 */
type Props = {
  readiness: Pick<DesignerReadiness, "designerIds" | "readyIds">;
  metadata: Record<string, unknown> | null | undefined;
  getLabel: (userId: string) => string;
  getAvatar: (userId: string) => string | null | undefined;
  isInactive: (userId: string) => boolean;
  formatAt: (iso: string) => string;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "C";

export function DesignerReadinessProp({ readiness, metadata, getLabel, getAvatar, isInactive, formatAt }: Props) {
  const { designerIds, readyIds } = readiness;
  const readySet = new Set(readyIds);
  const readyAtById = readDesignerReadyMap(metadata);
  return (
    <HoverTip
      // Без asChild: EntityProp не прокидає обробники миші, тож підказку
      // ловить власна обгортка HoverTip.
      label={
        <div className="space-y-1 text-xs">
          {designerIds.map((id) => {
            const readyAt = readySet.has(id) ? readyAtById[id]?.at : null;
            return (
              <div key={id} className="flex items-center gap-2">
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", readyAt ? "tone-dot-success" : "bg-muted-foreground/50")}
                />
                <span>
                  {getLabel(id)} — {readyAt ? `здано ${formatAt(readyAt)}` : "ще в роботі"}
                </span>
              </div>
            );
          })}
        </div>
      }
    >
      <EntityProp>
        <span className="flex items-center -space-x-1">
          {designerIds.map((id) => {
            const isReady = readySet.has(id);
            const label = getLabel(id);
            return (
              <span key={id} className="relative">
                <AvatarBase
                  src={getAvatar(id) ?? null}
                  name={label}
                  fallback={initials(label)}
                  size={18}
                  className={cn("border-line ring-2 ring-background transition-opacity", !isReady && "opacity-55")}
                  inactive={isInactive(id)}
                />
                {isReady ? (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-2.5 w-2.5 place-items-center rounded-full tone-dot-success ring-[1.5px] ring-background">
                    <Check className="h-2 w-2 text-white" weight="bold" />
                  </span>
                ) : null}
              </span>
            );
          })}
        </span>
        <span className="truncate max-w-[180px] tabular-nums">
          Версії · {readyIds.length} з {designerIds.length}
        </span>
      </EntityProp>
    </HoverTip>
  );
}
