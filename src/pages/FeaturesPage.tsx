import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import {
  groupFeatures,
  visibleFeatures,
  type FeatureCategory,
  type FeatureDefinition,
  type FeatureKey,
} from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState, type FeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";
import { FeatureOnboardingDialog } from "@/features/features/FeatureOnboardingDialog";
import { FeaturePreview } from "@/features/features/FeaturePreview";
import { FeatureRail } from "@/features/features/FeatureRail";

/**
 * Розділ «Можливості» — відповідь на питання «а що ця CRM узагалі вміє?».
 *
 * Розкладка «журнал + рейка-зміст» (рішення CEO 2026-08-05): тулбар іде через
 * слот шапки, як на решті сторінок; ліворуч рейка розділів зі скролспаєм і
 * кільцем прогресу; праворуч журнал, де в кожного рядка СВОЄ прев'ю.
 *
 * ВАЖЛИВО: заголовок сторінки живе в AppLayout (гілка ROUTES.features), а не
 * в контенті. Власний <h1> тут = подвійна шапка й зайвий відступ згори — саме
 * так виглядала перша версія.
 *
 * НАВІЩО взагалі: заміри по проду показали, що промо-модалка дала 53 покази
 * й 2 кліки, а дев'ять можливостей із двадцяти чотирьох знає одна людина або
 * ніхто. Головне рішення — фічу пробують ПРЯМО тут, а не «переходять кудись».
 */

type Filter = "all" | "untried" | "fresh";

const FILTER_LABEL: Record<Filter, string> = {
  all: "Усі",
  untried: "Ще не пробував",
  fresh: "Нові",
};

const STATE_LABEL: Record<Exclude<FeatureState, "unknown">, string> = {
  using: "Користуєшся",
  tried: "Пробував",
  untried: "Ще не пробував",
};

export default function FeaturesPage() {
  const { viewUserId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(viewUserId);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<FeatureKey | null>(null);
  const [activeCategory, setActiveCategory] = useState<FeatureCategory | null>(null);

  const headingRefs = useRef(new Map<FeatureCategory, HTMLElement>());

  // Одна позначка часу на весь рендер: інакше «нове» перераховувалось би
  // на кожному рядку й ламало мемоїзацію.
  const now = useMemo(() => new Date(), []);

  const mine = useMemo(
    () =>
      visibleFeatures({
        // moduleAccess === undefined означає «ще вантажиться». Дефолти за
        // роллю тут безпечніші за порожній список: сторінка не блимає пусткою.
        access: moduleAccess ?? defaultModuleAccess({ accessRole, jobRole }),
        accessRole,
        jobRole,
      }),
    [moduleAccess, accessRole, jobRole]
  );

  const stateOf = useMemo(() => {
    return (def: FeatureDefinition): FeatureState =>
      resolveFeatureState(def.measurable ? (adoption?.[def.key] ?? null) : undefined);
  }, [adoption]);

  const counts = useMemo(
    () => ({
      all: mine.length,
      untried: mine.filter((def) => stateOf(def) === "untried").length,
      fresh: mine.filter((def) => isFreshFeature(def, now)).length,
    }),
    [mine, stateOf, now]
  );

  const triedCount = useMemo(
    () => mine.filter((def) => ["tried", "using"].includes(stateOf(def))).length,
    [mine, stateOf]
  );

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mine.filter((def) => {
      if (filter === "untried" && stateOf(def) !== "untried") return false;
      if (filter === "fresh" && !isFreshFeature(def, now)) return false;
      if (!query) return true;
      return `${def.label} ${def.summary}`.toLowerCase().includes(query);
    });
  }, [mine, filter, search, stateOf, now]);

  const groups = useMemo(() => groupFeatures(shown), [shown]);

  const openFeature = useMemo(
    () => mine.find((def) => def.key === openKey) ?? null,
    [mine, openKey]
  );

  const resetFilters = useCallback(() => {
    setFilter("all");
    setSearch("");
  }, []);

  // Тулбар — у слот шапки, як на решті сторінок списків.
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
              <CountBadge value={counts[value]} />
            </Button>
          ))}
        </SegmentedGroup>
      }
      search={
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder="Пошук по можливостях..."
        />
      }
      meta={
        <ToolbarMeta
          count={shown.length}
          countLabel={shown.length === 1 ? "можливість" : "можливостей"}
          onReset={resetFilters}
          showReset={filter !== "all" || search.trim().length > 0}
        />
      }
    />,
    [filter, search, counts, shown.length, resetFilters]
  );

  // Скролспай: активний розділ рахуємо за верхньою межею вікна.
  useEffect(() => {
    const onScroll = () => {
      let current: FeatureCategory | null = null;
      for (const group of groups) {
        const node = headingRefs.current.get(group.category);
        if (node && node.getBoundingClientRect().top <= 140) current = group.category;
      }
      setActiveCategory(current ?? groups[0]?.category ?? null);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [groups]);

  const scrollToCategory = useCallback((category: FeatureCategory) => {
    const node = headingRefs.current.get(category);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  return (
    <div className="pb-8">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <FeatureRail
            groups={groups}
            activeCategory={activeCategory}
            onPick={scrollToCategory}
            triedCount={triedCount}
            totalCount={mine.length}
          />
        </div>

        <div className="min-w-0">
          {groups.map((group, groupIndex) => (
            <section key={group.category}>
              <header
                ref={(node) => {
                  if (node) headingRefs.current.set(group.category, node);
                  else headingRefs.current.delete(group.category);
                }}
                className={cn(
                  "flex items-center gap-3 pb-2.5 pt-1",
                  groupIndex > 0 && "mt-7"
                )}
              >
                <span className="font-mono text-3xs uppercase tracking-widest text-muted-foreground">
                  {group.label}
                </span>
                <span className="font-mono text-3xs tabular-nums text-muted-foreground opacity-70">
                  {group.features.length}
                </span>
                <span className="h-px flex-1 bg-border" />
              </header>

              {group.features.map((def, index) => {
                const state = stateOf(def);
                const fresh = isFreshFeature(def, now);
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => setOpenKey(def.key)}
                    className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-lg border-b border-border/70 px-1 py-4 text-left transition-colors hover:bg-secondary/40 xl:grid-cols-[2.25rem_minmax(0,1fr)_260px] xl:items-center"
                  >
                    <span className="pt-0.5 font-mono text-lg font-light tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="min-w-0 self-start">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold tracking-tight">{def.label}</span>
                        {fresh ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            <Star className="h-3 w-3" />
                            Нове
                          </span>
                        ) : state === "unknown" ? null : (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              state === "untried"
                                ? "bg-warning-soft text-warning-foreground"
                                : state === "using"
                                  ? "bg-success-soft text-success-foreground"
                                  : "bg-secondary text-muted-foreground"
                            )}
                          >
                            {STATE_LABEL[state]}
                          </span>
                        )}
                      </span>

                      <span className="mt-1 block max-w-[52ch] text-sm leading-6 text-muted-foreground">
                        {def.summary}
                      </span>

                      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        Спробувати
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </span>

                    <span className="col-start-2 xl:col-start-3">
                      <FeaturePreview featureKey={def.key} />
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold">Нічого не знайшлося</p>
              <p className="max-w-[36ch] text-xs text-muted-foreground">
                Спробуй інший запит або скинь фільтри у верхній панелі.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <FeatureOnboardingDialog
        feature={openFeature}
        open={Boolean(openFeature)}
        onOpenChange={(next) => {
          if (!next) setOpenKey(null);
        }}
      />
    </div>
  );
}
