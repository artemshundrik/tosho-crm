import { ExternalLink, X } from "lucide-react";
import { EntityAvatar } from "@/components/app/avatar-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThreadStage = {
  key: "quote" | "design" | "order";
  label: string;
  state: "done" | "now" | "todo";
};

type Props = {
  party: { name: string; logoUrl: string | null; kind: "customer" | "lead" } | null;
  title: string;
  number: string | null;
  stages: ThreadStage[];
  onOpenPage: (() => void) | null;
  onClose: () => void;
};

/**
 * Шапка починається з бренду замовника: справи в нас розрізняються не номером,
 * а тим, чий це бренд. Логотип — канонічний EntityAvatar (сам падає на кольорові
 * ініціали). Лід позначено окремо: це інша сутність з іншими наслідками.
 */
export function ThreadHeader({ party, title, number, stages, onOpenPage, onClose }: Props) {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2.5">
        <EntityAvatar
          src={party?.logoUrl ?? null}
          name={party?.name ?? "Замовник"}
          size={34}
          className="rounded-lg"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="truncate font-medium text-foreground/80">
              {party?.name ?? "Без замовника"}
            </span>
            {party?.kind === "lead" ? (
              <span className="shrink-0 rounded-full border border-warning-soft-border bg-warning-soft px-1.5 text-3xs font-semibold text-warning-foreground">
                Лід
              </span>
            ) : null}
            {number ? <span className="shrink-0 tabular-nums">· {number}</span> : null}
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onOpenPage ? (
            <Button
              type="button"
              variant="outline"
              size="iconSm"
              aria-label="Відкрити сторінку справи"
              onClick={onOpenPage}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="iconSm"
            aria-label="Закрити обговорення"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Смужка стадій пояснює, чому в одній нитці листування з трьох екранів.
          Для ручного замовлення стадія одна — тоді смужку не показуємо взагалі. */}
      {stages.length > 1 ? (
        <div className="flex gap-1">
          {stages.map((stage) => (
            <span
              key={stage.key}
              className={cn(
                "flex-1 rounded-md border px-2 py-1 text-center text-3xs",
                stage.state === "done" &&
                  "border-success-soft-border bg-success-soft text-success-foreground",
                stage.state === "now" && "border-primary/40 bg-primary/10 font-semibold text-primary",
                stage.state === "todo" && "border-border/60 text-muted-foreground opacity-60"
              )}
            >
              {stage.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
