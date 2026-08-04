import { useMemo, useState } from "react";
import { ArrowRight, MessageSquare, Mic, Send } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import { visibleFeatures, type FeatureDefinition, type FeatureKey } from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState, type FeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";
import { FeatureOnboardingDialog } from "@/features/features/FeatureOnboardingDialog";

/**
 * Розділ «Можливості» — відповідь на питання «а що ця CRM узагалі вміє?».
 *
 * НАВІЩО: заміри по проду (2026-08-04) показали, що промо-модалка дала 53
 * покази й лише 2 кліки, а дев'ять можливостей із двадцяти чотирьох знає одна
 * людина або ніхто. Ключове рішення — фічу можна спробувати ПРЯМО з картки,
 * не йдучи в дизайн-задачу чи профіль: саме перехід «кудись» і не працював.
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

const FEATURE_ICON: Record<FeatureKey, typeof Send> = {
  telegram_bot: Send,
  voice_dictation: Mic,
  task_chat: MessageSquare,
};

/** Свій тон кожній можливості — картки мають розрізнятися з першого погляду. */
const FEATURE_TONE: Record<FeatureKey, string> = {
  telegram_bot: "text-info-foreground bg-info-soft",
  voice_dictation: "text-warning-foreground bg-warning-soft",
  task_chat: "text-success-foreground bg-success-soft",
};

export default function FeaturesPage() {
  const { viewUserId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(viewUserId);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<FeatureKey | null>(null);

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

  const untriedCount = useMemo(
    () => mine.filter((def) => stateOf(def) === "untried").length,
    [mine, stateOf]
  );

  const openFeature = useMemo(
    () => mine.find((def) => def.key === openKey) ?? null,
    [mine, openKey]
  );

  return (
    <div className="flex flex-col gap-6 py-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Можливості</h1>
        <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
          Те, що CRM уміє полегшити щодня. Кожну можна спробувати прямо звідси — надиктувати,
          підключити бот чи написати в чат, не виходячи зі сторінки.
          {untriedCount > 0 ? ` Ти ще не пробував ${untriedCount} із ${mine.length}.` : ""}
        </p>
      </header>

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((def) => {
          const state = stateOf(def);
          const fresh = isFreshFeature(def, now);
          const Icon = FEATURE_ICON[def.key];
          return (
            <article
              key={def.key}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    FEATURE_TONE[def.key]
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold tracking-tight">{def.label}</h2>
                  {fresh ? (
                    <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Нове
                    </span>
                  ) : state === "unknown" ? null : (
                    <span
                      className={cn(
                        "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        state === "untried"
                          ? "bg-warning-soft text-warning-foreground"
                          : "bg-success-soft text-success-foreground"
                      )}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  )}
                </div>
              </div>

              <p className="flex-1 text-sm leading-6 text-muted-foreground">{def.summary}</p>

              <Button
                type="button"
                variant={state === "untried" ? "primary" : "outline"}
                className="w-full"
                onClick={() => setOpenKey(def.key)}
              >
                Спробувати тут
                <ArrowRight className="h-4 w-4" />
              </Button>
            </article>
          );
        })}

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">За цим фільтром нічого немає.</p>
        ) : null}
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
