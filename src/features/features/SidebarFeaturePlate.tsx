import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import { visibleFeatures, type FeatureDefinition } from "@/lib/featureCatalog";
import { isFreshFeature, resolveFeatureState } from "@/lib/featureState";
import { useMyFeatureAdoption } from "@/features/features/queries";

/**
 * Плашка над блоком акаунта — єдиний слот зі змінним вмістом (рішення CEO
 * 2026-08-05). Два режими:
 *
 *   • «анонс» — щойно вийшла помітна фіча і людина її ще не пробувала.
 *     Показуємо саму фічу з мініатюрою, бо промо-модалка провалилась
 *     (53 покази, 2 кліки) саме тому, що була текстом із кнопкою.
 *   • «кільце» — буденний стан: скільки з доступних можливостей уже
 *     спробував. Показує рух, а не голе число.
 *
 * Коли сказати нічого — плашки НЕМАЄ. Постійний елемент, що завжди повторює
 * одне й те саме, за тиждень стає шпалерами; вхід у каталог і так лишається
 * в меню акаунта.
 */

/** Скільки днів після появи фіча вважається приводом для анонсу. */
const ANNOUNCE_DAYS = 14;

type Mode =
  | { kind: "announce"; feature: FeatureDefinition }
  | { kind: "ring"; tried: number; total: number }
  | { kind: "hidden" };

export function SidebarFeaturePlate({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const { viewUserId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: adoption } = useMyFeatureAdoption(viewUserId);

  const now = useMemo(() => new Date(), []);

  const mode = useMemo<Mode>(() => {
    // Доступи ще вантажаться — краще нічого, ніж блимнути плашкою.
    if (moduleAccess === undefined) return { kind: "hidden" };

    const mine = visibleFeatures({
      access: moduleAccess ?? defaultModuleAccess({ accessRole, jobRole }),
      accessRole,
      jobRole,
    });
    if (mine.length === 0) return { kind: "hidden" };

    const stateOf = (def: FeatureDefinition) =>
      resolveFeatureState(def.measurable ? (adoption?.[def.key] ?? null) : undefined);

    // Свіжа й ще не пробувана — привід для анонсу. Беремо найновішу.
    const announce = mine
      .filter((def) => isFreshFeature(def, now, ANNOUNCE_DAYS) && stateOf(def) === "untried")
      .sort((a, b) => (b.since ?? "").localeCompare(a.since ?? ""))[0];
    if (announce) return { kind: "announce", feature: announce };

    const measurable = mine.filter((def) => def.measurable);
    const tried = measurable.filter((def) => ["tried", "using"].includes(stateOf(def))).length;
    if (measurable.length === 0 || tried >= measurable.length) return { kind: "hidden" };

    return { kind: "ring", tried, total: measurable.length };
  }, [moduleAccess, accessRole, jobRole, adoption, now]);

  if (mode.kind === "hidden") return null;

  // Згорнутий сайдбар — лише крапка-натяк, без тексту.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => navigate("/features")}
        aria-label="Можливості CRM"
        title="Можливості CRM"
        className="mx-auto grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <span className="h-2 w-2 rounded-full bg-[hsl(var(--success-solid))]" />
      </button>
    );
  }

  if (mode.kind === "announce") {
    return (
      <button
        type="button"
        onClick={() => navigate(`/features?open=${mode.feature.key}`)}
        className="group/plate grid w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40"
      >
        <span className="relative grid h-14 place-items-center border-b border-border bg-muted/60">
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px)",
              backgroundSize: "10px 10px",
            }}
          />
          <PlateThumb featureKey={mode.feature.key} />
        </span>
        <span className="grid gap-0.5 px-2.5 pb-2.5 pt-2">
          <span className="font-mono text-3xs uppercase tracking-widest text-primary">Нове</span>
          <span className="truncate text-xs font-semibold">{mode.feature.label}</span>
          <span className="line-clamp-2 text-3xs leading-4 text-muted-foreground">
            {mode.feature.summary}
          </span>
        </span>
      </button>
    );
  }

  const percent = Math.round((mode.tried / mode.total) * 100);
  const left = mode.total - mode.tried;

  return (
    <button
      type="button"
      onClick={() => navigate("/features")}
      className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40"
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(hsl(var(--success-solid)) ${percent}%, hsl(var(--muted)) 0)`,
        }}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-card font-mono text-3xs font-bold tabular-nums">
          {mode.tried}/{mode.total}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">Можливості</span>
        <span className="block text-3xs leading-4 text-muted-foreground">
          {left === 1 ? "1 ще не пробував" : `${left} ще не пробував`}
        </span>
      </span>
    </button>
  );
}

/** Крихітна мініатюра фічі — та сама мова, що у прев'ю в каталозі. */
function PlateThumb({ featureKey }: { featureKey: FeatureDefinition["key"] }) {
  if (featureKey === "voice_dictation") {
    return (
      <span className="relative w-[78%] rounded-md border border-border bg-card p-1.5 shadow-sm">
        <span className="mb-1 block h-1 w-3/4 rounded-full bg-foreground/15" />
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="h-1 flex-1 rounded-full bg-destructive/35" />
        </span>
      </span>
    );
  }

  if (featureKey === "task_chat") {
    return (
      <span className="relative grid w-[78%] gap-1 rounded-md border border-border bg-card p-1.5 shadow-sm">
        <span className="block h-2 w-3/5 rounded-md bg-muted" />
        <span className="ml-auto block h-2 w-2/5 rounded-md bg-primary/70" />
      </span>
    );
  }

  return (
    <span className="relative grid w-[78%] gap-1 rounded-md border border-border bg-card p-1.5 shadow-sm">
      <span className="block h-2 w-full rounded-sm bg-success-soft" />
      <span className="block h-1.5 w-2/3 rounded-full bg-foreground/12" />
    </span>
  );
}
