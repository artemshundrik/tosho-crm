import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, SearchX } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarMeta } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { useVisibleUpdates } from "@/features/features/useVisibleUpdates";
import { useMarkUpdatesRead } from "@/features/features/updateQueries";

/**
 * Стрічка «Що нового» — історія змін у CRM.
 *
 * Відрізняється від каталогу за призначенням: каталог відповідає «що взагалі
 * є», стрічка — «що змінилося». Більшість релізів це покращення наявних фіч,
 * тож каталогом їх не показати.
 *
 * Прочитаним усе позначається на вході на сторінку: людина сюди прийшла саме
 * читати, і лишати після цього бейдж означало б брехати лічильником.
 */

type Filter = "all" | "unread";

const FILTER_LABEL: Record<Filter, string> = {
  all: "Усі",
  unread: "Непрочитані",
};

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" });

export default function WhatsNewPage() {
  const navigate = useNavigate();
  const { viewUserId } = useAuth();
  const { visible, unread, ready } = useVisibleUpdates();
  const markRead = useMarkUpdatesRead(viewUserId);
  const [filter, setFilter] = useState<Filter>("all");

  // Показане на цій сторінці вважаємо прочитаним — але список для рендеру
  // фіксуємо ДО позначення, інакше фільтр «непрочитані» спорожнів би на очах.
  const [frozenUnread, setFrozenUnread] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!ready || frozenUnread) return;
    setFrozenUnread(new Set(unread.map((update) => update.id)));
    if (unread.length > 0) {
      markRead(
        unread.map((update) => update.id),
        "feed"
      );
    }
  }, [ready, unread, frozenUnread, markRead]);

  const shown = useMemo(() => {
    if (filter === "unread") {
      return visible.filter((update) => frozenUnread?.has(update.id));
    }
    return visible;
  }, [visible, filter, frozenUnread]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof shown>();
    for (const update of shown) {
      const date = new Date(update.publishedAt);
      const key = Number.isNaN(date.getTime()) ? "—" : MONTH.format(date);
      const list = map.get(key) ?? [];
      list.push(update);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [shown]);

  usePageHeaderActions(
    <UnifiedPageToolbar
      topLeft={
        <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
          {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
            <Button
              key={value}
              variant="segmented"
              size="xs"
              aria-pressed={filter === value}
              data-state={filter === value ? "on" : "off"}
              onClick={() => setFilter(value)}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              {FILTER_LABEL[value]}
              <CountBadge value={value === "all" ? visible.length : (frozenUnread?.size ?? 0)} />
            </Button>
          ))}
        </SegmentedGroup>
      }
      meta={<ToolbarMeta count={shown.length} countLabel={shown.length === 1 ? "запис" : "записів"} />}
    />,
    [filter, visible.length, frozenUnread, shown.length]
  );

  return (
    <div className="py-4">
      <div className="mx-auto max-w-[760px]">
        {groups.map(([month, items]) => (
          <section key={month}>
            <header className="flex items-center gap-3 pb-2.5 pt-1">
              <span className="font-mono text-3xs uppercase tracking-widest text-muted-foreground">
                {month}
              </span>
              <span className="h-px flex-1 bg-border" />
            </header>

            {items.map((update) => {
              const fresh = frozenUnread?.has(update.id);
              const date = new Date(update.publishedAt);
              return (
                <article
                  key={update.id}
                  className="border-b border-border py-5 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {fresh ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Нове
                      </span>
                    ) : null}
                    {update.importance === "major" ? (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-foreground">
                        Велика фіча
                      </span>
                    ) : null}
                    <time className="text-xs tabular-nums text-muted-foreground">
                      {Number.isNaN(date.getTime()) ? "" : DATE.format(date)}
                    </time>
                  </div>

                  <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{update.title}</h2>
                  <p className="mt-1.5 max-w-[62ch] text-sm leading-6 text-muted-foreground">
                    {update.body}
                  </p>

                  {update.ctaHref ? (
                    <button
                      type="button"
                      onClick={() => navigate(update.ctaHref as string)}
                      className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary"
                    >
                      {update.ctaLabel ?? "Подивитись"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}

        {ready && shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
              <SearchX className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold">
              {filter === "unread" ? "Усе прочитано" : "Записів ще немає"}
            </p>
            <p className="max-w-[38ch] text-xs text-muted-foreground">
              {filter === "unread"
                ? "Нові оновлення зʼявляться тут після наступного релізу."
                : "Тут буде історія змін у CRM."}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
