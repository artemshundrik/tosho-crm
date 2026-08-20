import * as React from "react";
import { Bell, BellOff, ChevronRight, CheckCheck, Info } from "lucide-react";

import { AppDropdown } from "@/components/app/AppDropdown";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { getNotificationAvatarMeta } from "@/lib/notificationAvatar";
import type { NotificationItem } from "@/lib/notifications";
import { FeatureHint } from "@/features/features/FeatureHint";
import type { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

/** Скільки рядків показуємо в панелі. Решта живе на /notifications — панель не список, а зведення. */
const VISIBLE_LIMIT = 20;

type PushApi = ReturnType<typeof usePushNotifications>;

type NotificationsMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Уже відфільтровані непрочитані, від найновішого. */
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  push: PushApi;
  onOpenItem: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
  onOpenAll: () => void;
  /** Веде в налаштування, де підключають Telegram (підказка в підвалі меню). */
  onOpenTelegramSetup: () => void;
};

function startOfDay(value: Date) {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const DAY_FORMATTER = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" });
const TIME_FORMATTER = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });

function getDayLabel(item: NotificationItem) {
  const parsed = new Date(item.createdAt);
  if (!item.createdAt || Number.isNaN(parsed.getTime())) return "Раніше";
  const diffDays = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(parsed).getTime()) / 86_400_000
  );
  if (diffDays <= 0) return "Сьогодні";
  if (diffDays === 1) return "Вчора";
  return DAY_FORMATTER.format(parsed);
}

/** Час без дати — дату вже несе заголовок групи. Якщо ISO немає, лишаємо повний рядок. */
function getShortTime(item: NotificationItem) {
  const parsed = new Date(item.createdAt);
  if (!item.createdAt || Number.isNaN(parsed.getTime())) return item.time;
  return TIME_FORMATTER.format(parsed);
}

function pluralizeNew(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} нове`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} нові`;
  return `${count} нових`;
}

function NotificationRow({
  item,
  onOpenItem,
}: {
  item: NotificationItem;
  onOpenItem: (item: NotificationItem) => void;
}) {
  const meta = getNotificationAvatarMeta(item);
  return (
    <DropdownMenuItem
      onSelect={() => onOpenItem(item)}
      className="cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 text-sm font-normal"
    >
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          meta.avatarClass
        )}
        aria-hidden="true"
      >
        {meta.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-semibold leading-tight text-foreground">
            {item.title}
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {getShortTime(item)}
          </span>
        </span>
        {item.description ? (
          <span className="mt-1 line-clamp-2 block text-xs leading-snug text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
    </DropdownMenuItem>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 px-2.5 py-2.5" aria-hidden="true">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-2 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

/**
 * Смуга статусу push. Свідомо мовчить на щасливому шляху: коли push працює,
 * писати про це нема сенсу — постійна пігулка лише крала місце в шапці.
 */
function PushStrip({ push }: { push: PushApi }) {
  if (!push.supported || !push.configured || push.enabled) return null;

  if (push.permission === "denied") {
    return (
      <div className="mx-1 my-1 flex items-start gap-2.5 rounded-lg border border-info-soft-border bg-info-soft px-3 py-2.5 text-xs leading-snug text-info-foreground">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Браузер заблокував сповіщення для цього сайту. Увімкнути можна лише в його налаштуваннях —
          біля адресного рядка.
        </span>
      </div>
    );
  }

  return (
    <div className="mx-1 my-1 flex items-center gap-2.5 rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
      <BellOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">Push вимкнено на цьому пристрої</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={push.enable}
        disabled={push.busy}
        className="h-7 shrink-0 px-2 font-semibold text-warning-foreground hover:bg-warning-soft-border/40"
      >
        {push.busy ? "Вмикаємо…" : "Увімкнути"}
      </Button>
    </div>
  );
}

export function NotificationsMenu({
  open,
  onOpenChange,
  items,
  unreadCount,
  loading,
  push,
  onOpenItem,
  onMarkAllRead,
  onOpenAll,
  onOpenTelegramSetup,
}: NotificationsMenuProps) {
  // Позначка дня друкується один раз на групу — дата в кожному рядку її не варта.
  const { rows, hiddenCount } = React.useMemo(() => {
    const visible = items.slice(0, VISIBLE_LIMIT);
    // Позначку дня виводимо з ПОПЕРЕДНЬОГО рядка, а не з накопичувача, який
    // мутували між ітераціями: компілятор має право мемоїзувати колбек .map
    // окремо, і тоді накопичувач показав би застаріле значення — заголовки
    // днів почали б дублюватись або зникати.
    const labels = visible.map((item) => getDayLabel(item));
    return {
      rows: visible.map((item, index) => ({
        item,
        label: index === 0 || labels[index] !== labels[index - 1] ? labels[index] : null,
      })),
      hiddenCount: Math.max(0, items.length - VISIBLE_LIMIT),
    };
  }, [items]);

  return (
    <AppDropdown
      align="end"
      sideOffset={10}
      contentClassName="w-[356px] overflow-x-hidden overflow-y-hidden"
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button
          type="button"
          variant="control"
          size="iconMd"
          className="relative h-10 w-10 rounded-xl border border-border/50 bg-muted/40 shadow-inner transition-all duration-200 hover:bg-muted/60"
          aria-label={unreadCount > 0 ? `Сповіщення, непрочитаних: ${unreadCount}` : "Сповіщення"}
          title="Сповіщення"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 ? (
            <span className="pointer-events-none absolute right-0 top-0 inline-flex h-5 min-w-5 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none tabular-nums text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      }
      content={
        <>
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">Сповіщення</span>
              {!loading && unreadCount > 0 ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-2xs font-semibold tabular-nums text-muted-foreground">
                  {pluralizeNew(unreadCount)}
                </span>
              ) : null}
            </div>
            {!loading && unreadCount > 0 ? (
              <Button
                type="button"
                variant="textMuted"
                size="xs"
                onClick={onMarkAllRead}
                className="h-7 shrink-0 gap-1.5 px-2"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {unreadCount === 1 ? "Прочитати" : "Прочитати всі"}
              </Button>
            ) : null}
          </div>

          {/* -mx-1.5 гасить p-1.5 самого DropdownMenuContent, інакше лінія не доходить до рамки. */}
          <div className="-mx-1.5 h-px bg-border/70" />

          <PushStrip push={push} />

          {loading ? (
            <div className="py-1">
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-1 py-3">
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/25 px-4 py-6 text-center">
                <span className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <CheckCheck className="h-4 w-4" />
                </span>
                <div className="text-[13.5px] font-semibold text-foreground">Усе прочитано</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Нові події зʼявляться тут автоматично.
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-[clamp(160px,45vh,288px)] overflow-y-auto overscroll-contain py-1">
              {rows.map(({ item, label }) => (
                <React.Fragment key={item.id}>
                  {label ? (
                    <div
                      role="presentation"
                      className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80"
                    >
                      {label}
                    </div>
                  ) : null}
                  <NotificationRow item={item} onOpenItem={onOpenItem} />
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="-mx-1.5 h-px bg-border/70" />

          {/* Найкращий момент розповісти про бота: людина щойно читала
              сповіщення в CRM, тобто сама довела, що вони їй потрібні.
              Показується лише тим, у кого бот не підключений. */}
          <FeatureHint
            featureKey="telegram_bot"
            variant="inline"
            className="mt-1.5"
            text="Ці сповіщення можуть приходити в Telegram — і тоді не треба тримати вкладку відкритою."
            actLabel="Підключити бота →"
            onAct={onOpenTelegramSetup}
          />

          <DropdownMenuItem
            onSelect={onOpenAll}
            className="mt-1 cursor-pointer justify-between px-2.5 py-2.5"
          >
            <span>Усі сповіщення</span>
            <span className="flex items-center gap-2">
              {hiddenCount > 0 ? (
                <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-2xs font-semibold tabular-nums text-muted-foreground">
                  ще {hiddenCount}
                </span>
              ) : null}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </DropdownMenuItem>
        </>
      }
    />
  );
}
