import { useMemo, useState } from "react";
import {
  Binary,
  BookOpen,
  Braces,
  ChevronDown,
  Cloud,
  Database,
  ExternalLink,
  HardDrive,
  ListChecks,
  Package,
  RefreshCw,
  ShieldAlert,
  Table2,
  Timer,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageLoading } from "@/components/app/page-loading";
import { pluralUk, pluralWordUk } from "@/lib/lastSeen";
import { STACK_SNAPSHOT } from "@/data/stackSnapshot.generated";
import {
  LAYER_META,
  layerLag,
  LAYER_ORDER,
  SEVERITY_LABEL,
  URGENCY_META,
  buildStackItems,
  formatAgoCoarse,
  groupByLayer,
  looksUnused,
  monthsSincePublish,
  STALE_PUBLISH_MONTHS,
  groupByUrgency,
  stackTotals,
  type StackItem,
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
                  storageKey={`layer_${group.key}`}
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
                  storageKey={`urgency_${group.key}`}
                  first={index === 0}
                  dot={URGENCY_META[group.key].dot}
                  label={URGENCY_META[group.key].label}
                  count={group.items.length}
                  summary={urgencySummary(group.key, group.items)}
                  items={group.items}
                />
              ))}
        </div>

        {/*
          БЕЗ sticky — навмисно (24.08.2026). Липка колонка працює, лише поки
          вона нижча за екран: інакше браузер прибиває її верх, нижня картка
          стає недосяжною, а дві колонки їдуть із різною швидкістю — Артем
          назвав це «асинхронним скролом», і це рівно воно. Третя картка
          «Що працює само» перетнула висоту екрана й зробила ваду видимою.
          Тепер сторінка прокручується як одне ціле, як і решта сторінок. */}
        <aside className="grid gap-3.5">
          <EffortCard items={items} />
          <GuardsCard />
          <AutomationCard platform={platform.data ?? null} />
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

/**
 * Один факт про платформу: іконка, ЧИСЛО і підпис.
 *
 * ЧОМУ НЕ РІВНИЙ СІРИЙ РЯДОК, ЯК БУЛО. Досі тут стояло вісім однакових сірих
 * речень поспіль, і око не чіплялось ні за що: «Postgres 17.6 · 97 таблиць у
 * схемі tosho · 82 функції…». Це не смуга даних, а абзац, набраний дрібним.
 *
 * ЩО ЗМІНИЛОСЬ. Число — кольору тексту й моноширинне (клас figure), підпис
 * лишається приглушеним, попереду іконка. Ієрархія робить усю роботу: спершу
 * видно ЧИСЛА, потім, за потреби, про що вони.
 */
function PlatformFact({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-muted-foreground/70" aria-hidden />
      <span className="figure font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function PlatformFootnote({ platform }: { platform: StackPlatform | null }) {
  if (!platform) return <span>Платформа: дані ще їдуть</span>;
  const storage = formatBytesUk(platform.storage_bytes);
  const database = formatBytesUk(platform.database_bytes);
  const tables = platform.schema_tables ?? 0;
  const functions = platform.schema_functions ?? 0;
  const crons = platform.cron_jobs ?? 0;
  return (
    <>
      <PlatformFact icon={Database} value={`Postgres ${platform.postgres_version ?? "?"}`} label="" />
      <PlatformFact icon={Table2} value={tables} label={`${pluralWordUk(tables, "таблиця", "таблиці", "таблиць")} у tosho`} />
      <PlatformFact icon={Braces} value={functions} label={pluralWordUk(functions, "функція", "функції", "функцій")} />
      <PlatformFact icon={Timer} value={crons} label={pluralWordUk(crons, "крон", "крони", "кронів")} />
      {database ? <PlatformFact icon={HardDrive} value={database} label="база" /> : null}
      {storage ? <PlatformFact icon={Cloud} value={storage} label="Storage" /> : null}
      <PlatformFact icon={Binary} value={`Node ${STACK_SNAPSHOT.node}`} label="" />
      <PlatformFact
        icon={Webhook}
        value={STACK_SNAPSHOT.netlifyFunctions}
        label={`${pluralWordUk(STACK_SNAPSHOT.netlifyFunctions, "функція", "функції", "функцій")} Netlify`}
      />
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

const GROUP_OPEN_PREFIX = "tosho_stack_group_";

/** За замовчуванням група РОЗГОРНУТА: ховати дані мовчки не можна. */
function readGroupOpen(key: string) {
  try {
    return window.localStorage.getItem(`${GROUP_OPEN_PREFIX}${key}`) !== "0";
  } catch {
    return true;
  }
}

function writeGroupOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(`${GROUP_OPEN_PREFIX}${key}`, open ? "1" : "0");
  } catch {
    /* приватний режим — просто не запамʼятаємо, це не привід ламати клік */
  }
}

/**
 * Група = кольоровий квадратик + назва + лічильник + підсумок праворуч.
 * Той самий рядок, що над секціями «Витрат», — щоб не заводити другу мову.
 *
 * ЗГОРТАЄТЬСЯ РІЗКО. Вміст просто зникає й зʼявляється — жодної анімації
 * висоти. Це не економія: розкриття 34 рядків через плавну висоту дає ривок на
 * кожному кадрі, бо браузер переміряє весь список. Крутиться лише стрілка, і
 * саме вона робить дію зрозумілою. Той самий рецепт, що в секціях «Витрат».
 *
 * Стан памʼятається між сесіями: згорнув «Платформу» — вона лишиться згорнутою
 * і завтра. Розділ відкривають, щоб подивитись конкретне, і щоразу згортати
 * решту було б роботою замість відповіді.
 */
function StackGroup({
  storageKey,
  first,
  dot,
  label,
  count,
  summary,
  items,
}: {
  storageKey: string;
  first: boolean;
  dot: string;
  label: string;
  count: number;
  summary: React.ReactNode;
  items: StackItem[];
}) {
  const [open, setOpen] = useState(() => readGroupOpen(storageKey));
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    setOpen((prev) => {
      writeGroupOpen(storageKey, !prev);
      return !prev;
    });
  };

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
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 px-4 pb-2 pt-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5",
          !first && "border-t border-border/40"
        )}
      >
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", dot)} />
        <span className="text-[13.5px] font-semibold">{label}</span>
        <span className="figure text-2xs text-muted-foreground">{count}</span>
        <span className="ml-auto text-xs text-muted-foreground">{summary}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>

      {!open ? null : (
        <>
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
                className="flex w-full cursor-pointer items-center gap-2 border-t border-border/40 px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 sm:px-5"
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
        </>
      )}
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
  minor: {
    label: "minor",
    className: "bg-warning-soft text-warning-foreground",
  },
  patch: { label: "патч", className: "bg-muted text-muted-foreground" },
  // Прив'язана версія — не «відстала» й не «свіжа»: вона правильна за
  // визначенням, і колір має це показувати окремим тоном, а не зеленим.
  pinned: { label: "прив'язано", className: "bg-chart-1/12 text-chart-1" },
  fresh: {
    label: "свіже",
    className: "bg-success-soft text-success-foreground",
  },
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
      {/* Лого пакета, якщо його є звідки взяти, інакше монограма. Avatar тут не
          прикраса: він сам перемикається на fallback, коли картинка не
          завантажилась, — тобто відсутній інтернет чи заблокований фавікон
          дають монограму, а не порожню діру. Плитка квадратна зі скругленням,
          як у Витратах: це пакет, а не людина. */}
      <Avatar
        className={cn("h-8 w-8 rounded-[9px] border", item.iconUrl ? "border-border/60 bg-card" : "border-transparent")}
      >
        {item.iconUrl ? (
          // object-contain — лого не обрізається; padding, щоб воно не впиралось у краї.
          <AvatarImage src={item.iconUrl} alt="" className="object-contain p-1" />
        ) : null}
        <AvatarFallback
          className={cn(
            "figure rounded-[9px] text-[13px] font-semibold",
            item.worstSeverity ? "bg-destructive/10 text-destructive" : LAYER_META[item.layer].tile
          )}
        >
          {monogram(item.name)}
        </AvatarFallback>
      </Avatar>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <StackRowPopover item={item} />
          <span className={cn("rounded-md px-1.5 py-0.5 text-2xs", chip.className)}>{chip.label}</span>
          {item.worstSeverity ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">
              <ShieldAlert className="h-3 w-3" />
              діра безпеки · {SEVERITY_LABEL[item.worstSeverity]}
            </span>
          ) : null}
          {looksUnused(item) ? (
            <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">
              не використовується
            </span>
          ) : null}
          {item.dev ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">dev</span>
          ) : null}
        </span>
        <span className="figure truncate text-2xs text-muted-foreground">
          {/* Дірки вже відсортовані за важкістю (buildStackItems), тож перша —
              саме та, чию важкість називає чипс поруч. */}
          {item.worstSeverity
            ? `${item.advisories[0]?.title ?? ""}${
                item.advisories.length > 1 ? ` · і ще ${item.advisories.length - 1}` : ""
              }`
            : (item.note ??
              (item.state === "pinned"
                ? item.pinned?.why
                : [bumped ? `оновлювали ${bumped}` : null, waiting ? `нова версія ${waiting}` : null]
                    .filter(Boolean)
                    .join(" · ")))}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="figure block text-[13.5px] font-medium">{item.version}</span>
        <span className="block text-2xs text-muted-foreground">
          {item.state === "fresh" ? (
            "найновіша"
          ) : item.state === "pinned" ? (
            "за Node"
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

/**
 * Картка пакета — відповідь на «а що це взагалі таке».
 *
 * У рядку є місце рівно на назву, версію й стан. Але дивлячись на
 * «@tanstack/react-virtual», людина зазвичай питає інше: що воно робить, чи
 * потрібне нам і коли ми його чіпали. Три відповіді не влазять у рядок і не
 * варті окремої сторінки — отже попап.
 *
 * Відкривається кліком, а не наведенням: миша, що проїхала повз, не має
 * розкривати картку, а на дотику наведення не існує взагалі.
 */
function StackRowPopover({ item }: { item: StackItem }) {
  const bumped = formatAgoCoarse(item.bumpedAt);
  const unused = looksUnused(item);
  const published = formatAgoCoarse(item.publishedAt);
  const months = monthsSincePublish(item);
  const stale = months !== null && months >= STALE_PUBLISH_MONTHS;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          /* Курсор-ручка навмисно: це не посилання, але поводиться як
             клікабельне, і рука — єдиний натяк, який людина читає без
             підказки. Підкреслення при наведенні дублює той самий сигнал. */
          className="cursor-pointer truncate rounded text-left text-[13.5px] font-medium underline-offset-4 hover:underline"
        >
          {item.label ?? item.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13.5px] font-semibold">{item.label ?? item.name}</span>
          <span className="figure text-2xs text-muted-foreground">{item.version}</span>
        </div>

        {item.description ? (
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{item.description}</p>
        ) : item.note ? (
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{item.note}</p>
        ) : null}

        <dl className="mt-3 grid gap-1.5 border-t border-border/40 pt-2.5 text-2xs">
          {typeof item.usedIn === "number" ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Використовується</dt>
              <dd className={cn("figure font-medium", unused && "text-destructive")}>
                {unused
                  ? "ніде — можна прибрати"
                  : `${item.usedIn} ${pluralWordUk(item.usedIn, "файл", "файли", "файлів")}`}
              </dd>
            </div>
          ) : null}

          {bumped ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="shrink-0 text-muted-foreground">Востаннє чіпали</dt>
              <dd className="figure truncate font-medium">{bumped}</dd>
            </div>
          ) : null}

          {item.state !== "fresh" && item.state !== "pinned" && item.latest ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">У npm зараз</dt>
              <dd className="figure font-medium">{item.latest}</dd>
            </div>
          ) : null}

          {published ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="shrink-0 text-muted-foreground">Останній реліз</dt>
              <dd className={cn("figure truncate font-medium", stale && "text-warning-foreground")}>{published}</dd>
            </div>
          ) : null}
        </dl>

        {item.bumpCommit ? (
          /* Тема коміта відповідає на «чому саме тоді» — дата сама по собі не
             пояснює нічого, а тема майже завжди пояснює. */
          <p className="mt-2 border-t border-border/40 pt-2 text-2xs text-muted-foreground">
            <span className="figure">{item.bumpCommit.sha}</span>
            {item.bumpCommit.subject ? ` · ${item.bumpCommit.subject}` : ""}
          </p>
        ) : null}

        {/* Посилання підписані так, щоб не треба було знати, що таке npm:
            «сторінка пакета» і «документація» кажуть, куди саме потрапиш.
            Рядками на всю ширину, а не двома словами в кутку — так вони
            читаються як дії, а не як дрібний підпис. */}
        <div className="mt-2.5 grid gap-0.5 border-t border-border/40 pt-2">
          {item.name !== "node" ? (
            <a
              href={`https://www.npmjs.com/package/${item.name}`}
              target="_blank"
              rel="noreferrer"
              className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/60"
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Сторінка пакета</span>
              <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
            </a>
          ) : null}
          {item.homepage ? (
            <a
              href={item.homepage}
              target="_blank"
              rel="noreferrer"
              className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/60"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Документація</span>
              <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
            </a>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────────── права колонка ───────────────────────── */

const ASIDE_TITLE = "text-3xs font-bold uppercase tracking-widest text-muted-foreground";

/**
 * «Скільки це роботи» — замість смужок «наскільки відстаємо».
 *
 * ЧОМУ ЗАМІНЕНО. Смужки показували частку відсталих пакетів у кожному шарі, і
 * майже всі були червоні: 6 з 32, 7 з 15, 1 з 8. Коли червоне скрізь, колір
 * перестає щось означати — а головне, з нього не випливає жодної дії.
 *
 * Питання, яке насправді ставлять, — «скільки це часу». Відповідь виводиться
 * з двох речей, які ми вже знаємо: наскільки болісний стрибок і скільки коду
 * за пакет тримається.
 *
 * Оцінка навмисно груба — три кошики замість годин. Точні години тут були б
 * вигадкою: скільки займе переїзд, видно лише коли за нього беруться.
 */
function EffortCard({ items }: { items: StackItem[] }) {
  const buckets = useMemo(() => {
    const project: StackItem[] = [];
    const evening: StackItem[] = [];
    const batch: StackItem[] = [];
    for (const item of items) {
      if (item.state === "major") {
        // Мажор у пакеті, за який тримаються десятки файлів, — це не вечір.
        if ((item.usedIn ?? 0) >= 20) project.push(item);
        else evening.push(item);
      } else if (item.state === "minor" || item.state === "patch") {
        batch.push(item);
      }
    }
    return { project, evening, batch };
  }, [items]);

  /**
   * ТІЛЬКИ ЧИСЛА — за прямою вимогою Артема 24.08.2026.
   *
   * Тут послідовно було зайве, і він тицьнув у кожне: спершу перелік пакетів
   * («@eslint/js, date-fns, eslint й ще 7») — незрозуміло, що це за сімка й
   * навіщо вона в підсумку; потім рядок-пояснення під кожним заголовком і
   * абзац про те, як рахується розкладка. Слова його: «просто скільки штуки —
   * все, більше нічого не треба».
   *
   * Що лишилось: колір, дія й число. Самі пакети з їхніми версіями видно
   * поруч, у списку — дублювати їх у підсумку означало питати те саме двічі.
   */
  const rows: Array<{ key: string; label: string; count: number; dot: string }> = [
    { key: "project", label: "Планувати окремо", count: buckets.project.length, dot: "bg-destructive" },
    { key: "evening", label: "Братись по одному", count: buckets.evening.length, dot: "bg-warning-solid" },
    { key: "batch", label: "Оновити разом", count: buckets.batch.length, dot: "bg-success-solid" },
  ];

  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Що робити з оновленнями</h3>
      <div className="mt-2.5 grid gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline gap-2">
            <span className={cn("h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]", row.dot)} />
            <span className={cn("text-xs", row.count === 0 ? "text-muted-foreground" : "font-medium")}>
              {row.label}
            </span>
            <span
              className={cn(
                "figure ml-auto text-xs",
                row.count === 0 ? "text-muted-foreground" : "font-medium"
              )}
            >
              {row.count}
            </span>
          </div>
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
/**
 * Групи сторожів. Живуть у знімку (GUARD_GROUPS у генераторі), тут лише
 * підпис та іконка — щоб перелік не роздвоївся на код і на сторінку.
 */
const GUARD_GROUP_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  code: { label: "Код", icon: Braces },
  registry: { label: "Наші реєстри", icon: ListChecks },
  db: { label: "Жива база", icon: Database },
};

function GuardsCard() {
  const { guards, tests, testFiles, lintStubs } = STACK_SNAPSHOT;

  /**
   * Число живе НА СВОЄМУ чипсі, а не поруч окремим.
   *
   * Доти «заглушки лінта: 29» стояли окремим чипсом біля «заглушки правил
   * хуків» — двома різними назвами того самого. Артем спитав, що це таке, і
   * питання було справедливе: сторінка сама себе дублювала.
   */
  const labelOf = (name: string) => {
    if (name === "тести" && tests) return `${tests} тестів`;
    if (name === "заглушки правил хуків" && lintStubs) return `${name}: ${lintStubs}`;
    return name;
  };

  const groups = useMemo(() => {
    const order: Array<"code" | "registry" | "db"> = ["code", "registry", "db"];
    return order
      .map((key) => ({ key, list: guards.filter((guard) => (guard.group ?? "registry") === key) }))
      .filter((group) => group.list.length > 0);
  }, [guards]);

  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Сторожа перед пушем</h3>
      {/*
        ПРО КОЛІР. Тон каже, ЩО ЦЕ ЗА СТОРОЖА, а не «щойно пройшла»: сторінка
        цього знати не може — перевірки живуть у гаку на машині, і зелений
        обіцяв би захист, якого в цю мить може й не бути. Тому лише два тони:
        синій — просто стоїть на варті; жовтий — несе борг, і число видно
        просто на чипсі. Червоного немає навмисно: чесного джерела для «зараз
        погано» в сторінки немає, а вигаданий червоний — та сама брехня, від
        якої нас беріг сірий.
      */}
      <p className="mt-0.5 text-3xs text-muted-foreground">
        Кожна стоїть між тобою й продом. Натисни, щоб дізнатись, що саме вона ловить.
      </p>
      <div className="mt-2.5 grid gap-2.5">
        {groups.map((group) => {
          const meta = GUARD_GROUP_META[group.key];
          const Icon = meta.icon;
          return (
            <div key={group.key} className="grid gap-1.5">
              <div className="flex items-center gap-1.5 text-3xs uppercase tracking-caps text-muted-foreground">
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {meta.label}
                <span className="figure ml-auto normal-case tracking-normal">{group.list.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.list.map((guard) => {
                  const carriesDebt = guard.name === "заглушки правил хуків" && Boolean(lintStubs);
                  return (
                    <Popover key={guard.name}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "cursor-pointer rounded-md border px-1.5 py-0.5 text-2xs transition-colors",
                            carriesDebt
                              ? "tone-warning hover:brightness-[0.97]"
                              : "tone-info-subtle border-info-soft-border text-info-foreground hover:brightness-[0.97]"
                          )}
                        >
                          {labelOf(guard.name)}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-3">
                        <p className="text-[13px] font-semibold">{guard.name}</p>
                        {guard.note ? (
                          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{guard.note}</p>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 border-t border-border/40 pt-2 text-3xs text-muted-foreground">
        {testFiles ? `${pluralUk(testFiles, "файл", "файли", "файлів")} тестів · ` : ""}
        {STACK_SNAPSHOT.sourceLines.toLocaleString("uk-UA")} рядків коду · знімок{" "}
        {formatAgoCoarse(STACK_SNAPSHOT.generatedAt) ?? "щойно"}
      </p>
    </section>
  );
}

/**
 * «Що працює само» — автоматика, якої на сторінці не було видно взагалі.
 *
 * НАВІЩО. «Стек» відповідає на питання «з чого це зроблено», але досі відповідав
 * лише про npm-пакети. Половина того, що тримає проєкт, — не пакети: роботи в
 * GitHub, розклади в самій базі, гаки на машині, плагін збірки. Про них не
 * пам'ятають саме тому, що їх ніде не видно.
 *
 * ДАНІ ВИЧИТАНІ, А НЕ ВПИСАНІ. Роботи, гаки й плагіни бере генератор знімка з
 * файлів; кількість кронів — жива, з бази. Список рукою протух би за тиждень:
 * 24.08.2026 я сам додав дві перевірки, і README про них не знав.
 */
function AutomationCard({ platform }: { platform: StackPlatform | null }) {
  const automation = STACK_SNAPSHOT.automation;
  if (!automation) return null;

  const rows: Array<{
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count: number | null;
    detail: string;
  }> = [
    {
      key: "workflows",
      icon: Cloud,
      label: "Роботи в GitHub",
      count: automation.workflows.length,
      detail: automation.workflows.map((flow) => `${flow.name} — ${flow.trigger}`).join(" · "),
    },
    {
      key: "cron",
      icon: Timer,
      label: "Розклади в базі",
      count: platform?.cron_jobs ?? null,
      detail: "дайджести, нагадування, алерти, знімки здоров'я, версії стеку",
    },
    {
      key: "hooks",
      icon: ShieldAlert,
      label: "Гаки на машині",
      count: automation.hooks.length,
      detail: automation.hooks.join(", "),
    },
    {
      key: "plugins",
      icon: Package,
      label: "Плагіни збірки",
      count: automation.plugins.length,
      detail: automation.plugins.map((name) => name.replace(/^\/plugins\//, "")).join(", "),
    },
  ];

  return (
    <section className={cn(CARD, "p-3.5")}>
      <h3 className={ASIDE_TITLE}>Що працює само</h3>
      <p className="mt-0.5 text-3xs text-muted-foreground">
        Крутиться без людини — і саме тому про це забувають.
      </p>
      <div className="mt-2.5 grid gap-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className="grid gap-0.5">
              <div className="flex items-baseline gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-muted-foreground/70" aria-hidden />
                <span className="text-xs font-medium">{row.label}</span>
                <span className="figure ml-auto text-xs font-medium">{row.count ?? "—"}</span>
              </div>
              <p className="pl-[22px] text-3xs leading-snug text-muted-foreground">{row.detail}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 border-t border-border/40 pt-2 text-3xs text-muted-foreground">
        Хмарних рутин тут немає навмисно: вони живуть поза репозиторієм, і чесно
        порахувати їх звідси неможливо.
      </p>
    </section>
  );
}
