import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoading } from "@/components/app/page-loading";
import { pluralUk, pluralWordUk } from "@/lib/lastSeen";
import { STACK_SNAPSHOT } from "@/data/stackSnapshot.generated";
import {
  LAYER_META,
  LAYER_ORDER,
  SEVERITY_LABEL,
  URGENCY_META,
  buildStackItems,
  formatAgoCoarse,
  groupByLayer,
  groupByUrgency,
  layerLag,
  stackTotals,
  type StackItem,
  type StackLayer,
  type StackTotals,
  type StackUrgency,
} from "@/lib/stack";
import { useStackPlatform, useStackRecheck, useStackVersions, type StackPlatform } from "@/features/stack/queries";

/**
 * «Стек» — з чого зроблена CRM і що з цим не так (REQ-116).
 *
 * МОВА ЕКРАНА ВЗЯТА, А НЕ ВИГАДАНА. Велике число з часткою-смугою й легендою
 * кольорових квадратиків — з «Витрат»; чипси-мітки кольором за змістом і моно
 * на ідентифікаторах — з «Беклогу»; теплова карта і смужки-треки в правій
 * колонці — з «Релізів». Три попередні макети відхилені саме тому, що були в
 * чужому стилі, тож нового словника тут навмисно немає.
 *
 * ДВА ГРУПУВАННЯ — ДВА ПИТАННЯ. «За шарами» відповідає «де саме тріщина» й
 * заразом показує будову; «за терміновістю» — «що робити першим». Рядки ті
 * самі, змінюється лише розкладка, тож перемикач нічого не довантажує.
 *
 * СТОРІНКА НІЧОГО НЕ ОНОВЛЮЄ. Вона показує стан; пакети оновлює людина руками.
 * Єдина дія — «Перевірити зараз», і та лише перепитує npm через функцію.
 */

type Mode = "layers" | "urgency";

export function StackOverview() {
  const [mode, setMode] = useState<Mode>("layers");
  const versions = useStackVersions();
  const platform = useStackPlatform();
  const recheck = useStackRecheck();

  const items = useMemo(() => buildStackItems(STACK_SNAPSHOT, versions.data ?? []), [versions.data]);
  const totals = useMemo(() => stackTotals(items), [items]);

  if (versions.isLoading) return <PageLoading />;

  const runRecheck = () => {
    recheck.mutate(undefined, {
      onSuccess: (result) => {
        const checked = typeof result?.checked === "number" ? result.checked : 0;
        toast.success(`Перевірено ${checked} ${pluralWordUk(checked, "пакет", "пакети", "пакетів")}`);
      },
      onError: (error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Не вийшло перевірити");
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="h-10">
            <TabsTrigger value="layers" className="h-8 text-[13px]">
              За шарами
            </TabsTrigger>
            <TabsTrigger value="urgency" className="h-8 text-[13px]">
              За терміновістю
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={runRecheck}
          disabled={recheck.isPending}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", recheck.isPending && "animate-spin")} />
          {recheck.isPending ? "Питаю npm…" : "Перевірити зараз"}
        </Button>
      </div>

      {mode === "layers" ? (
        <LayersHero totals={totals} items={items} platform={platform.data ?? null} />
      ) : (
        <UrgencyHero totals={totals} />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
          {mode === "layers"
            ? groupByLayer(items).map((group, index) => (
                <StackGroup
                  key={group.key}
                  first={index === 0}
                  dot={LAYER_META[group.key].dot}
                  label={LAYER_META[group.key].label}
                  count={group.items.length}
                  summary={layerSummary(group.items)}
                  items={group.items}
                />
              ))
            : groupByUrgency(items).map((group, index) => (
                <StackGroup
                  key={group.key}
                  first={index === 0}
                  dot={URGENCY_META[group.key].dot}
                  label={URGENCY_META[group.key].label}
                  count={group.items.length}
                  summary={urgencySummary(group.key, group.items)}
                  items={group.items}
                />
              ))}
        </div>

        <aside className="grid gap-3.5 lg:sticky lg:top-2">
          <LagCard items={items} />
          <BumpHeatmap items={items} />
          <GuardsCard />
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────── герої ─────────────────────────────── */

const CARD = "rounded-2xl border border-border/40 bg-card";
const LABEL = "text-2xs font-medium uppercase tracking-wide text-muted-foreground";

/** Смуга з часток + легенда — той самий примітив, що в bento-підсумку «Витрат». */
function Split({ parts }: { parts: Array<{ key: string; label: string; value: number; color: string }> }) {
  const visible = parts.filter((part) => part.value > 0);
  if (visible.length === 0) return null;
  return (
    <>
      <div className="mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
        {visible.map((part) => (
          <div
            key={part.key}
            className={cn("rounded-[2px]", part.color)}
            style={{ flexGrow: part.value, flexBasis: 0, minWidth: 6 }}
            title={`${part.label} — ${part.value}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1.5 py-0.5 text-xs">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", part.color)} />
            <span className="text-muted-foreground">{part.label}</span>
            <span className="font-medium tabular-nums text-foreground">{part.value}</span>
          </span>
        ))}
      </div>
    </>
  );
}

function HeroShell({
  label,
  value,
  suffix,
  badge,
  children,
  footnote,
}: {
  label: string;
  value: number;
  suffix: string;
  badge: React.ReactNode;
  children?: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <div className={cn(CARD, "p-4 sm:p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <div className={LABEL}>{label}</div>
          <div className="figure mt-1.5 flex items-baseline gap-2 text-2xl font-semibold leading-none text-foreground sm:text-[28px]">
            {value}
            <span className="text-base font-normal text-muted-foreground">{suffix}</span>
          </div>
        </div>
        {badge}
      </div>
      {children}
      {footnote ? (
        <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2.5 text-2xs text-muted-foreground">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium",
        tone === "good" && "border-success-soft-border bg-success-soft text-success-foreground",
        tone === "warn" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
        tone === "bad" && "border-destructive/25 bg-destructive/5 text-destructive"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Герой вкладки «за шарами»: смуга ділить за ВАГОЮ шару, а не за станом.
 *
 * Тому з першого погляду видно будову — половина стеку малює екран, а
 * найтонший шар «Дані» саме той, через який ходять усі гроші. Стан лишається
 * в чипсах на рядках, і ці дві мови не конкурують за одну смугу.
 */
function LayersHero({
  totals,
  items,
  platform,
}: {
  totals: StackTotals;
  items: StackItem[];
  platform: StackPlatform | null;
}) {
  const lag = layerLag(items);
  const behindLayers = lag.filter((row) => row.behind > 0).length;

  return (
    <HeroShell
      label="З чого зроблена CRM"
      value={totals.total}
      suffix={`${pluralWordUk(totals.total, "залежність", "залежності", "залежностей")} у чотирьох шарах`}
      badge={
        behindLayers === 0 ? (
          <Pill tone="good">усі шари свіжі</Pill>
        ) : (
          <Pill tone="warn">
            {behindLayers} {pluralWordUk(behindLayers, "шар відстає", "шари відстають", "шарів відстають")}
          </Pill>
        )
      }
      footnote={<PlatformFootnote platform={platform} />}
    >
      <Split
        parts={LAYER_ORDER.map((layer) => ({
          key: layer,
          label: LAYER_META[layer].label,
          value: items.filter((item) => item.layer === layer).length,
          color: LAYER_META[layer].dot,
        }))}
      />
    </HeroShell>
  );
}

/** Герой вкладки «за терміновістю»: смуга ділить за НАСЛІДКОМ. */
function UrgencyHero({ totals }: { totals: StackTotals }) {
  const updates = totals.major + totals.minor + totals.patch;
  const checked = formatAgoCoarse(totals.checkedAt);

  return (
    <HeroShell
      label={`Стан стеку · ${totals.total} ${pluralWordUk(totals.total, "залежність", "залежності", "залежностей")}`}
      value={updates}
      suffix={updates === 0 ? "оновлень — усе свіже" : pluralWordUk(updates, "оновлення", "оновлення", "оновлень")}
      badge={
        totals.vulnerable > 0 ? (
          <Pill tone="bad">
            <ShieldAlert className="h-3 w-3" />
            {totals.vulnerable} {pluralWordUk(totals.vulnerable, "діра", "діри", "дір")} безпеки
          </Pill>
        ) : totals.checkedAt === null ? (
          <Pill tone="warn">npm ще не питали</Pill>
        ) : (
          <Pill tone="good">дірок безпеки немає</Pill>
        )
      }
      footnote={
        <>
          <span>{totals.checkedAt ? `Перевірено ${checked}` : "Перевірки ще не було"}</span>
          <span>наступна — о 6:10 ранку</span>
          {totals.unknown > 0 ? <span>{totals.unknown} без відповіді реєстру</span> : null}
        </>
      }
    >
      <Split
        parts={[
          { key: "major", label: "Ламає код", value: totals.major, color: "bg-destructive" },
          { key: "minor", label: "Є нове", value: totals.minor + totals.patch, color: "bg-warning-solid" },
          { key: "fresh", label: "Свіже", value: totals.fresh, color: "bg-success-solid" },
          { key: "unknown", label: "Невідомо", value: totals.unknown, color: "bg-muted-foreground/30" },
        ]}
      />
    </HeroShell>
  );
}

/**
 * Байти українською.
 *
 * Своя, а не спільна з Observability: та сторінка технічна й пише «GB», а тут
 * усе речення українською, і латинська одиниця посеред «Storage 7,74 ГБ»
 * читалась би як недогляд.
 */
function formatBytesUk(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

function PlatformFootnote({ platform }: { platform: StackPlatform | null }) {
  if (!platform) return <span>Платформа: дані ще їдуть</span>;
  const storage = formatBytesUk(platform.storage_bytes);
  const database = formatBytesUk(platform.database_bytes);
  return (
    <>
      <span>Postgres {platform.postgres_version ?? "?"}</span>
      <span>
        {platform.schema_tables ?? "?"}{" "}
        {pluralWordUk(platform.schema_tables ?? 0, "таблиця", "таблиці", "таблиць")} у схемі tosho
      </span>
      <span>
        {platform.schema_functions ?? "?"}{" "}
        {pluralWordUk(platform.schema_functions ?? 0, "функція", "функції", "функцій")}
      </span>
      <span>
        {platform.cron_jobs ?? "?"} {pluralWordUk(platform.cron_jobs ?? 0, "крон", "крони", "кронів")}
      </span>
      {database ? <span>база {database}</span> : null}
      {storage ? <span>Storage {storage}</span> : null}
      <span>Node {STACK_SNAPSHOT.node}</span>
      <span>
        {STACK_SNAPSHOT.netlifyFunctions}{" "}
        {pluralWordUk(STACK_SNAPSHOT.netlifyFunctions, "функція", "функції", "функцій")} Netlify
      </span>
    </>
  );
}

/* ─────────────────────────── групи й рядки ─────────────────────────── */

function layerSummary(items: StackItem[]) {
  const breaking = items.filter((item) => item.state === "major").length;
  if (breaking > 0) {
    return (
      <>
        <b className="figure font-medium text-foreground">{breaking}</b>{" "}
        {pluralWordUk(breaking, "ламає", "ламають", "ламають")} код
      </>
    );
  }
  const available = items.filter((item) => item.state === "minor" || item.state === "patch").length;
  if (available > 0) {
    return (
      <>
        <b className="figure font-medium text-foreground">{available}</b>{" "}
        {pluralWordUk(available, "має", "мають", "мають")} нову версію
      </>
    );
  }
  return <>усе свіже</>;
}

function urgencySummary(key: StackUrgency, items: StackItem[]) {
  if (key === "fresh") return <>нічого робити</>;
  const layers = new Set(items.map((item) => item.layer));
  return (
    <>
      у {layers.size} {pluralWordUk(layers.size, "шарі", "шарах", "шарах")}
    </>
  );
}

/**
 * Група = кольоровий квадратик + назва + лічильник + підсумок праворуч.
 * Той самий рядок, що над секціями «Витрат», — щоб не заводити другу мову.
 */
function StackGroup({
  first,
  dot,
  label,
  count,
  summary,
  items,
}: {
  first: boolean;
  dot: string;
  label: string;
  count: number;
  summary: React.ReactNode;
  items: StackItem[];
}) {
  const [expanded, setExpanded] = useState(false);

  /**
   * Свіжі пакети НЕ показуємо рядками.
   *
   * Їх більшість, вони не потребують дій, і повний список перетворює сторінку
   * на інвентаризацію: те, що вимагає уваги, тоне серед того, що не вимагає.
   * Один сірий рядок з іменами відповідає на «а що там ще?», а стрілка
   * розгортає повний список, коли справді треба.
   */
  const attention = items.filter((item) => item.state !== "fresh");
  const fresh = items.filter((item) => item.state === "fresh");

  return (
    <section>
      <div className={cn("flex items-center gap-2.5 px-4 pb-2 pt-3.5 sm:px-5", !first && "border-t border-border/40")}>
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", dot)} />
        <span className="text-[13.5px] font-semibold">{label}</span>
        <span className="figure text-2xs text-muted-foreground">{count}</span>
        <span className="ml-auto text-xs text-muted-foreground">{summary}</span>
      </div>

      {attention.map((item) => (
        <StackRow key={item.name} item={item} />
      ))}

      {fresh.length > 0 ? (
        expanded ? (
          fresh.map((item) => <StackRow key={item.name} item={item} />)
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center gap-2 border-t border-border/40 px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 sm:px-5"
          >
            <span className="min-w-0 flex-1 truncate">
              {fresh
                .slice(0, 6)
                .map((item) => `${item.name} ${item.version}`)
                .join(" · ")}
              {fresh.length > 6 ? ` · і ще ${fresh.length - 6}` : ""}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
        )
      ) : null}
    </section>
  );
}

/**
 * Монограма пакета — за ОБЛАСТЮ, якщо вона є.
 *
 * «@tailwindcss/vite» — це Tailwind, а не Vite, і плитка з «V» збивала б з
 * пантелику саме там, де мала б допомагати впізнати рядок з першого погляду.
 * Для пакетів без області беремо першу літеру імені.
 */
function monogram(name: string) {
  const source = name.startsWith("@") ? name.slice(1, name.indexOf("/") === -1 ? undefined : name.indexOf("/")) : name;
  return (source.replace(/^[^a-zA-Zа-яА-Я]+/, "")[0] ?? name[0] ?? "?").toUpperCase();
}

/** Скільки повних діб минуло; null — дати немає або вона нечитабельна. */
function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
}

const STATE_CHIP: Record<string, { label: string; className: string }> = {
  major: { label: "major", className: "bg-destructive/10 text-destructive" },
  minor: { label: "minor", className: "bg-warning-soft text-warning-foreground" },
  patch: { label: "патч", className: "bg-muted text-muted-foreground" },
  fresh: { label: "свіже", className: "bg-success-soft text-success-foreground" },
  unknown: { label: "не питали", className: "bg-muted text-muted-foreground" },
};

function StackRow({ item }: { item: StackItem }) {
  const chip = STATE_CHIP[item.state];
  const bumped = formatAgoCoarse(item.bumpedAt);
  /**
   * «Нова версія висить N» — лише коли вона справді висить.
   *
   * latest_seen_at — це коли МИ її помітили, а не коли її випустили. У день
   * першої перевірки він у всіх сьогоднішній, і рядок «нова версія сьогодні»
   * стояв би в кожному рядку, ще й читався б як «її сьогодні випустили».
   * Тиждень — поріг, після якого це вже спостереження, а не шум.
   */
  const waitingDays = daysSince(item.latestSeenAt);
  const waiting =
    item.state !== "fresh" && item.state !== "unknown" && waitingDays !== null && waitingDays >= 7
      ? formatAgoCoarse(item.latestSeenAt)
      : null;

  return (
    <div className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 sm:px-5">
      <span
        className={cn(
          "figure grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[13px] font-semibold",
          item.worstSeverity ? "bg-destructive/10 text-destructive" : LAYER_META[item.layer].tile
        )}
        aria-hidden="true"
      >
        {monogram(item.name)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium">{item.name}</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-2xs", chip.className)}>{chip.label}</span>
          {item.worstSeverity ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">
              <ShieldAlert className="h-3 w-3" />
              діра безпеки · {SEVERITY_LABEL[item.worstSeverity]}
            </span>
          ) : null}
          {item.dev ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">dev</span> : null}
        </span>
        <span className="figure truncate text-2xs text-muted-foreground">
          {/* Дірки вже відсортовані за важкістю (buildStackItems), тож перша —
              саме та, чию важкість називає чипс поруч. */}
          {item.worstSeverity
            ? `${item.advisories[0]?.title ?? ""}${
                item.advisories.length > 1 ? ` · і ще ${item.advisories.length - 1}` : ""
              }`
            : [bumped ? `оновлювали ${bumped}` : null, waiting ? `нова версія ${waiting}` : null]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="figure block text-[13.5px] font-medium">{item.version}</span>
        <span className="block text-2xs text-muted-foreground">
          {item.state === "fresh" ? (
            "найновіша"
          ) : item.state === "unknown" ? (
            "невідомо"
          ) : (
            <>
              вийшла{" "}
              <span className={cn("figure", item.state === "major" ? "text-destructive" : "text-warning-foreground")}>
                {item.latest}
              </span>
            </>
          )}
        </span>
      </span>

      <a
        href={`https://www.npmjs.com/package/${item.name}`}
        target="_blank"
        rel="noreferrer"
        title="Відкрити на npmjs.com"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/* ───────────────────────────── права колонка ───────────────────────── */

const ASIDE_TITLE = "text-3xs font-bold uppercase tracking-widest text-muted-foreground";

/** «Наскільки відстаємо» — смужки-треки по шарах, як у «Релізах». */
function LagCard({ items }: { items: StackItem[] }) {
  const rows = layerLag(items);
  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Наскільки відстаємо</h3>
      <div className="mt-2.5 grid gap-2">
        {rows.map((row) => {
          const share = row.total === 0 ? 0 : Math.round((row.behind / row.total) * 100);
          return (
            <div key={row.layer} className="grid gap-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{LAYER_META[row.layer as StackLayer].label}</span>
                <span className="figure font-medium text-foreground">
                  {row.behind} з {row.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    share === 0 ? "bg-success-solid" : share >= 25 ? "bg-destructive" : "bg-warning-solid"
                  )}
                  style={{ width: `${Math.max(share, share > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

/**
 * «Коли оновлювали за рік» — теплова карта по місяцях.
 *
 * Дані — з історії package.json (у знімку), а не з npm: питання тут про НАШУ
 * дисципліну, а не про чужі релізи. Порожній місяць — це місяць, коли жодну
 * залежність не рухали, і саме довгі світлі смуги тут інформативні.
 */
function BumpHeatmap({ items }: { items: StackItem[] }) {
  const cells = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string; count: number }> = [];
    for (let back = 11; back >= 0; back -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
      buckets.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: MONTHS_SHORT[date.getMonth()],
        count: 0,
      });
    }
    const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));
    for (const item of items) {
      if (!item.bumpedAt) continue;
      const position = index.get(item.bumpedAt.slice(0, 7));
      if (position !== undefined) buckets[position].count += 1;
    }
    return buckets;
  }, [items]);

  const max = Math.max(1, ...cells.map((cell) => cell.count));

  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Коли оновлювали за рік</h3>
      <div className="mt-2.5 grid grid-cols-12 gap-[3px]">
        {cells.map((cell) => (
          <i
            key={cell.key}
            title={`${cell.label}: ${cell.count} ${pluralWordUk(cell.count, "пакет", "пакети", "пакетів")}`}
            className={cn(
              "aspect-square rounded-[3px]",
              cell.count === 0
                ? "bg-muted"
                : cell.count >= max * 0.66
                  ? "bg-success-solid"
                  : cell.count >= max * 0.33
                    ? "bg-success-solid/60"
                    : "bg-success-solid/30"
            )}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-3xs text-muted-foreground">
        {cells
          .filter((_, index) => index % 3 === 0)
          .map((cell) => (
            <span key={cell.key}>{cell.label}</span>
          ))}
      </div>
    </section>
  );
}

/**
 * «Сторожа перед пушем» — чипси з реального гака.
 *
 * Перелік не написаний тут руками, а вичитаний зі scripts/hooks/pre-push у
 * момент знімка: другий список розійшовся б із першим, і картка обіцяла б
 * захист, якого немає.
 */
function GuardsCard() {
  const { guards, tests, testFiles, lintStubs } = STACK_SNAPSHOT;
  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Сторожа перед пушем</h3>
      {/* Чипси НЕЙТРАЛЬНІ навмисно: це перелік того, що стоїть перед пушем, а
          не табло стану. Зелений означав би «щойно пройшло», а сторінка цього
          не знає — перевірки живуть у гаку на машині, і фарбувати їх зеленим
          означало б обіцяти захист, якого в цю мить може й не бути. */}
      <p className="mt-0.5 text-3xs text-muted-foreground">Не пустять зламане в прод — кожна перед кожним пушем.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {guards.map((guard) => (
          <span key={guard} className="rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            {guard === "тести" && tests ? `${tests} тестів` : guard}
          </span>
        ))}
        {lintStubs ? (
          <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs text-warning-foreground">
            заглушки лінта: {lintStubs}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 border-t border-border/40 pt-2 text-3xs text-muted-foreground">
        {testFiles ? `${pluralUk(testFiles, "файл", "файли", "файлів")} тестів · ` : ""}
        {STACK_SNAPSHOT.sourceLines.toLocaleString("uk-UA")} рядків коду · знімок{" "}
        {formatAgoCoarse(STACK_SNAPSHOT.generatedAt) ?? "щойно"}
      </p>
    </section>
  );
}
