import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import { visibleFeatures, type FeatureDefinition, type FeatureKey } from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState, type FeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";
import { FeatureOnboardingDialog } from "@/features/features/FeatureOnboardingDialog";
import { FeaturePreview } from "@/features/features/FeaturePreview";

/**
 * Розділ «Можливості» — відповідь на питання «а що ця CRM узагалі вміє?».
 *
 * Розкладка «розворот + прев'ю» (рішення CEO 2026-08-04): ліворуч рейка із
 * заголовком, лічильником і фільтрами; посередині типографічний список із
 * мононумерацією; праворуч — живе прев'ю тієї можливості, на яку навели.
 * Та сама мова, що в онбординг-вікні, тож сторінка й вікно — одна родина.
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
  const [openKey, setOpenKey] = useState<FeatureKey | null>(null);
  const [previewKey, setPreviewKey] = useState<FeatureKey | null>(null);

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

  const shown = useMemo(() => {
    return mine.filter((def) => {
      if (filter === "untried") return stateOf(def) === "untried";
      if (filter === "fresh") return isFreshFeature(def, now);
      return true;
    });
  }, [mine, filter, stateOf, now]);

  // Прев'ю завжди має що показувати: тримаємось наведеного рядка, а якщо
  // його відфільтрували — падаємо на перший зі списку.
  useEffect(() => {
    if (shown.length === 0) return;
    if (!previewKey || !shown.some((def) => def.key === previewKey)) {
      setPreviewKey(shown[0].key);
    }
  }, [shown, previewKey]);

  const preview = useMemo(
    () => shown.find((def) => def.key === previewKey) ?? shown[0] ?? null,
    [shown, previewKey]
  );

  const openFeature = useMemo(
    () => mine.find((def) => def.key === openKey) ?? null,
    [mine, openKey]
  );

  return (
    <div className="py-4">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px] xl:gap-8">
        {/* ── Рейка ── */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-20">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Можливості</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Що CRM уміє полегшити щодня. Кожну можна спробувати прямо звідси.
            </p>
          </div>

          {counts.untried > 0 ? (
            <div className="flex items-baseline gap-2.5 border-t border-border pt-4">
              <span className="text-3xl font-light tracking-tight tabular-nums">
                {counts.untried}
              </span>
              <span className="text-xs leading-4 text-muted-foreground">
                із {counts.all}
                <br />
                ще не пробував
              </span>
            </div>
          ) : null}

          <nav className="grid gap-0.5 border-t border-border pt-3">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  filter === value
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {FILTER_LABEL[value]}
                <span className="font-mono text-2xs opacity-70">{counts[value]}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Список ── */}
        <div className="border-t border-border">
          {shown.map((def, index) => {
            const state = stateOf(def);
            const fresh = isFreshFeature(def, now);
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => setOpenKey(def.key)}
                onMouseEnter={() => setPreviewKey(def.key)}
                onFocus={() => setPreviewKey(def.key)}
                className={cn(
                  "grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-4 border-b border-border py-5 pr-2 text-left transition-colors hover:bg-secondary/40",
                  preview?.key === def.key && "bg-secondary/30"
                )}
              >
                <span className="font-mono text-xl font-light tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className="min-w-0">
                  <span className="block text-lg font-semibold tracking-tight">{def.label}</span>
                  <span className="mt-1 block max-w-[58ch] text-sm leading-6 text-muted-foreground">
                    {def.summary}
                  </span>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Спробувати
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </span>

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
                        : state === "using"
                          ? "bg-success-soft text-success-foreground"
                          : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {STATE_LABEL[state]}
                  </span>
                )}
              </button>
            );
          })}

          {shown.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">За цим фільтром нічого немає.</p>
          ) : null}
        </div>

        {/* ── Прев'ю: показує, що всередині, ще до кліку ── */}
        {preview ? (
          <aside className="hidden content-start gap-3 xl:sticky xl:top-20 xl:grid">
            <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              Як це виглядає
            </p>
            <FeaturePreview featureKey={preview.key} />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOpenKey(preview.key)}
            >
              Спробувати тут
              <ArrowRight className="h-4 w-4" />
            </Button>
          </aside>
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
