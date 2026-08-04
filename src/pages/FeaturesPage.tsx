import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import { visibleFeatures, type FeatureDefinition } from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState, type FeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";

/**
 * Розділ «Можливості» — відповідь на питання «а що ця CRM узагалі вміє?».
 *
 * НАВІЩО: заміри по проду (2026-08-04) показали, що промо-модалка дала 53
 * покази й лише 2 кліки, а дев'ять можливостей із двадцяти чотирьох знає одна
 * людина або ніхто. Модалка лікує «не помітив нового», але не лікує «не знаю,
 * що є» — для цього потрібне місце, куди можна прийти самому.
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
  const navigate = useNavigate();
  const { viewUserId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(viewUserId);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Одна позначка часу на весь рендер: інакше «нове» перераховувалось би
  // на кожній картці й ламало мемоїзацію.
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

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mine.filter((def) => {
      if (filter === "untried" && stateOf(def) !== "untried") return false;
      if (filter === "fresh" && !isFreshFeature(def, now)) return false;
      if (!query) return true;
      return `${def.label} ${def.summary}`.toLowerCase().includes(query);
    });
  }, [mine, filter, search, stateOf, now]);

  const active = useMemo(
    () => shown.find((def) => def.key === activeKey) ?? shown[0] ?? null,
    [shown, activeKey]
  );

  const untriedCount = useMemo(
    () => mine.filter((def) => stateOf(def) === "untried").length,
    [mine, stateOf]
  );

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Можливості</h1>
        <p className="text-sm text-muted-foreground">
          {mine.length} доступно тобі
          {untriedCount > 0 ? `, ${untriedCount} ще не пробував` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Пошук по можливостях"
          aria-label="Пошук по можливостях"
          className="h-9 max-w-xs"
        />
        {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "primary" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {FILTER_LABEL[value]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2 sm:grid-cols-2">
          {shown.map((def) => {
            const state = stateOf(def);
            const fresh = isFreshFeature(def, now);
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => setActiveKey(def.key)}
                aria-current={active?.key === def.key}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent",
                  active?.key === def.key && "border-primary/50 ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{def.label}</span>
                  {fresh ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Нове
                    </span>
                  ) : state === "unknown" ? null : (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        state === "untried"
                          ? "bg-warning-soft text-warning-foreground"
                          : "bg-success-soft text-success-foreground"
                      )}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{def.summary}</p>
              </button>
            );
          })}

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">За цим фільтром нічого немає.</p>
          ) : null}
        </div>

        {active ? (
          <aside className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold tracking-tight">{active.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{active.summary}</p>

            <ol className="mt-4 grid gap-2">
              {active.steps.map((step, index) => (
                <li key={step} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="font-mono text-xs font-semibold text-primary">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <Button type="button" className="mt-5 w-full" onClick={() => navigate(active.route)}>
              Спробувати
            </Button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
