import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";

import { integrationFaviconUrl, type IntegrationDefinition } from "./integrationsCatalog";
import { plural } from "./integrationsStatus";
import {
  INTEGRATION_PLATE_TONE,
  INTEGRATION_STATE_ICON,
  INTEGRATION_STATE_LABEL,
  INTEGRATION_STATE_TONE,
} from "./integrationsPresentation";
import type { IntegrationActivity, IntegrationMetric, IntegrationStatus } from "./integrationsStatus";

/**
 * Картка сервісу в списку «Інтеграцій».
 *
 * ГОЛОВНЕ РІШЕННЯ МАКЕТА (затверджено 2026-08-15): ряди картки мають ФІКСОВАНУ
 * висоту. Якщо дати їм рости за вмістом, кожна картка отримає свою висоту, і
 * логотипи, числа та плашки станів поїдуть одне відносно одного — рядок карток
 * перестане читатись як таблиця. Саме таку «живу» верстку й забракували.
 *
 * Наслідок, який треба тримати в голові: довгий текст стану НЕ розсуває картку,
 * а обрізається трикрапкою. Повний текст показує підказка — але тільки там, де
 * обрізання справді сталось (див. useIsClamped).
 */
const CARD_ROWS = "grid-rows-[36px_18px_46px_65px_32px]";

/**
 * Чи текст справді не вліз у відведені йому рядки.
 *
 * Перевірка потрібна саме в рантаймі: те саме речення влазить у два рядки на
 * широкій колонці й не влазить на вузькій. Підказка, що дослівно повторює вже
 * видимий текст, — це шум, який ще й перекриває сусідні картки.
 */
function useIsClamped(text: string) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return { ref, clamped };
}

/** «89», «5 з 130», «$0.34» — число; «увімкнено», «—» — ні. */
const hasDigits = (value: string | null): boolean => value != null && /\d/.test(value);

function IntegrationMark({ definition, muted }: { definition: IntegrationDefinition; muted: boolean }) {
  const { Mark, domain, name } = definition;
  // Не підключено — знак сірий. Колір бренду тут працює як обіцянка «воно
  // живе»; на тому, чого ще немає, він обманює око.
  const dim = muted ? "grayscale opacity-60" : undefined;
  if (Mark) {
    // Знак малюється НА ВСЮ область 36px, без сірої підкладки: інлайнові
    // марки мають власне тло (синій квадрат Dropbox, коло Telegram), і всередині
    // ще однієї плашки вони виглядали крихітними поруч із фавіконами, які
    // заповнюють квадрат повністю.
    return <Mark className={cn("h-9 w-9 shrink-0", dim)} />;
  }
  // Немає інлайнового знака — беремо фавікон домену тим самим трюком, що й
  // лого підписок у Фінансах. EntityAvatar сам покаже монограму, якщо не
  // завантажилось, тож картка ніколи не лишається з порожнім квадратом.
  return (
    <EntityAvatar
      src={domain ? integrationFaviconUrl(domain) : null}
      name={name}
      size={36}
      className={cn("shrink-0 rounded-xl", dim)}
    />
  );
}

/** Одна комірка показника. Немає значення — комірка порожня, без прочерку. */
function Metric({ metric }: { metric: IntegrationMetric | null }) {
  if (!metric?.value) return <div aria-hidden="true" />;
  return (
    <div className="min-w-0">
      {/* Фіксована висота + вирівнювання по низу: велике число й коротке слово
          мають різну висоту рядка, і без цього показники сусідніх карток
          стояли на лініях, що різнились на 4px. */}
      <div className="flex h-6 items-end">
        <span
          className={cn(
            "truncate leading-tight text-foreground",
            // Великий кегль — привілей ЧИСЕЛ. Слово («увімкнено», «за фактом»)
            // у тому ж кеглі читається як заголовок картки й перетягує погляд,
            // хоча важить менше за сусіднє число.
            hasDigits(metric.value) ? "text-lg font-semibold tabular-nums" : "text-sm font-medium"
          )}
        >
          {metric.value}
        </span>
      </div>
      <div className="truncate text-3xs uppercase tracking-caps-tight text-muted-foreground">{metric.label}</div>
    </div>
  );
}

export function IntegrationCard({
  definition,
  status,
  onOpen,
}: {
  definition: IntegrationDefinition;
  status: IntegrationStatus;
  onOpen: () => void;
}) {
  const tone = INTEGRATION_STATE_TONE[status.state];
  const plateTone = INTEGRATION_PLATE_TONE[status.state];
  const StateIcon = INTEGRATION_STATE_ICON[status.state];
  const { ref: messageRef, clamped } = useIsClamped(status.message);

  return (
    <button
      type="button"
      onClick={onOpen}
      // Уся картка — одна кнопка. Це навмисно: вкладена кнопка в кнопці
      // невалідна, а дія в підвалі («Налаштувати ›») веде туди ж, куди й клік
      // по картці, тож окремий елемент керування був би обманом.
      className={cn(
        "grid w-full gap-3 rounded-section border border-border/60 bg-card p-4 text-left",
        CARD_ROWS,
        "transition-[background-color,border-color,box-shadow] duration-base ease-out motion-reduce:transition-none",
        "hover:border-border hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      {/* Ряд 1 — хто це і в якому стані */}
      <div className="flex min-w-0 items-center gap-2.5">
        <IntegrationMark definition={definition} muted={definition.planned === true} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{definition.name}</span>
        <Badge tone={tone} size="sm" className="shrink-0 gap-1">
          <StateIcon className="h-3 w-3" aria-hidden="true" />
          {INTEGRATION_STATE_LABEL[status.state]}
        </Badge>
      </div>

      {/* Ряд 2 — навіщо воно людині. Рівно ОДИН рядок: описи короткі, а два
          рядки лишали під однорядковими півпорожню смугу до самих чисел.
          Розгорнутий опис живе у шторці. */}
      <p className="truncate text-xs text-muted-foreground">{definition.what}</p>

      {/* Ряд 3 — показники плюс третя комірка (ціна або залишок). Порожня
          комірка лишається порожньою: прочерк у великому кеглі виглядає як
          зламане число, а не як «немає даних». */}
      <div className="grid grid-cols-3 gap-3">
        <Metric metric={status.metrics[0]} />
        <Metric metric={status.metrics[1]} />
        <Metric metric={status.thirdMetric} />
      </div>

      {/* Ряд 4 — плашка стану. Рівно два рядки; довший текст обрізається.
          Тон свій, не як у бейджа: коли все добре, плашка сіра (див.
          INTEGRATION_PLATE_TONE). Лінія на всю ширину картки (-mx-4) йде саме
          ПІД повідомленням: вона відділяє суть картки від службового підвалу,
          а не розриває числа й текст, які читаються разом. */}
      <div className="-mx-4 border-b border-border/60 px-4 pb-3">
        <div className={cn("flex items-start gap-2 rounded-inner border px-2.5 py-2", toneSubtleClass[plateTone])}>
          <StateIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", toneTextClass[plateTone])} aria-hidden="true" />
          <p
            ref={messageRef}
            className="line-clamp-2 text-2xs leading-snug text-foreground"
            // Підказка тільки коли текст справді не вліз — інакше вона дублює
            // те, що й так видно.
            title={clamped ? status.message : undefined}
          >
            {status.message}
          </p>
        </div>
      </div>

      {/* Ряд 5 — коли востаннє щось сталось і куди веде картка */}
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate">{formatActivity(status.activity)}</span>
        <span className="flex shrink-0 items-center gap-0.5 font-medium text-foreground">
          {/* Підпис мусить збігатися з тим, що справді станеться: «Налаштувати»
              лише там, де в CRM є що крутити; «Показники» — де є куди піти по
              цифри; решта чесно каже «Деталі». */}
          {definition.settingsPath
            ? "Налаштувати"
            : definition.monitorPath && !definition.planned
              ? "Показники"
              : "Деталі"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

/** «2 год тому», «5 днів тому», «26 червня». Порожньо — null. */
export function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} ${plural(minutes, "хвилину", "хвилини", "хвилин")} тому`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "годину", "години", "годин")} тому`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${plural(days, "день", "дні", "днів")} тому`;
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

/**
 * «остання накладна — 3 дні тому». Підпис приходить разом із датою саме тому,
 * що спільного «остання дія» не існує: у кожного сервісу свій слід, і коли
 * підпис не збігається зі значенням, за ним роблять хибний висновок.
 */
export function formatActivity(activity: IntegrationActivity): string {
  const ago = formatAgo(activity.at);
  return ago ? `${activity.label} — ${ago}` : activity.emptyText;
}
