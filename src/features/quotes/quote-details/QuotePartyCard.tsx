import { ChevronRight } from "lucide-react";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import type { QuoteDeadlineTone } from "@/features/quotes/components/QuoteDeadlineBadge";
import { cn } from "@/lib/utils";

/**
 * «Хто це» і «коли треба» — шапка бокової колонки прорахунку.
 *
 * Замінила собою список із восьми рядків «підпис — значення». Причина заміни —
 * замір на живих картках: чотири рядки з восьми казали «Не вказано», тобто
 * половина висоти блока повідомляла про порожнечу. Тут незаповнений дедлайн
 * займає символ тире в комірці доріжки, а не власний рядок.
 *
 * Доставка й нагадування (`extras`) показуються лише тоді, коли справді
 * заповнені: порожніми вони не малюються, але й не ховаються в меню.
 */

export type QuoteDeadlineTrackItem = {
  label: string;
  short: string;
  tone: QuoteDeadlineTone;
  title: string;
};

export type QuotePartyExtra = { label: string; value: string };

type QuotePartyCardProps = {
  customerName?: string | null;
  customerLogoUrl?: string | null;
  customerInitials: string;
  managerName?: string | null;
  managerAvatarUrl?: string | null;
  managerInitials?: string;
  createdAt?: string | null;
  deadlines: QuoteDeadlineTrackItem[];
  extras: QuotePartyExtra[];
  onOpenParty: () => void;
  onOpenDeadlines: () => void;
};

export function QuotePartyCard({
  customerName,
  customerLogoUrl,
  customerInitials,
  managerName,
  managerAvatarUrl,
  managerInitials,
  createdAt,
  deadlines,
  extras,
  onOpenParty,
  onOpenDeadlines,
}: QuotePartyCardProps) {
  return (
    <section className="shrink-0 overflow-hidden rounded-inner border border-border/40 bg-card">
      <button
        type="button"
        onClick={onOpenParty}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      >
        {/* 36 px — це рівно висота двох рядків поруч: назва (13.5/16) плюс рядок
            менеджера (11/15) із проміжком. На 28 аватар «висів» проти них, і блок
            читався як три різні висоти замість одного рядка. */}
        <EntityAvatar
          src={customerLogoUrl ?? null}
          name={customerName ?? "Замовник / Лід"}
          fallback={customerInitials}
          size={36}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold leading-tight">
            {customerName ?? "Замовник не вказаний"}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            {managerName ? (
              <>
                <AvatarBase
                  src={managerAvatarUrl ?? null}
                  name={managerName}
                  fallback={managerInitials ?? ""}
                  size={14}
                  className="shrink-0 border-border/60"
                  showStatusIndicator={false}
                />
                <span className="truncate">{managerName}</span>
              </>
            ) : (
              <span className="truncate">Менеджера не призначено</span>
            )}
            {createdAt ? (
              <span className="shrink-0 whitespace-nowrap">
                · створено{" "}
                {new Date(createdAt).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
      </button>

      <div className="px-1.5 pb-1.5">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border/40">
          {deadlines.map((item) => (
            <button
              key={`deadline-track-${item.label}`}
              type="button"
              onClick={onOpenDeadlines}
              title={item.title}
              className="grid justify-items-center gap-0.5 bg-card px-1 py-1 text-center transition-colors hover:bg-muted/50"
            >
              <span className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
                {item.label}
              </span>
              <span
                className={cn(
                  "text-2xs font-semibold tabular-nums",
                  item.tone === "overdue" && "text-danger-foreground",
                  item.tone === "today" && "text-warning-foreground",
                  item.tone === "soon" && "text-warning-foreground",
                  item.tone === "none" && "font-normal text-muted-foreground/50"
                )}
              >
                {item.short}
              </span>
            </button>
          ))}
        </div>
      </div>

      {extras.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border/40 px-2.5 py-1.5 text-2xs text-muted-foreground">
          {extras.map((extra) => (
            <span key={extra.label} className="inline-flex items-center gap-1.5">
              {extra.label}
              <span className="font-medium text-foreground">{extra.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
