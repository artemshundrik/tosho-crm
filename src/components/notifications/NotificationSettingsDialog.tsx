import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { NotificationChannelMatrix } from "@/components/notifications/NotificationChannelMatrix";
import { BadgeCheck, BellRing, MonitorSmartphone, Send, ShieldAlert, Volume2, X as CloseIcon } from "@/components/icons/appIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { readInAppNotificationPreferences, writeInAppNotificationPreferences } from "@/lib/inAppNotificationPreferences";
import { playNotificationSound } from "@/lib/notificationSound";
import { db } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type SoundDebugState = {
  level: "idle" | "success" | "error";
  message: string;
};

type SettingsTone = "active" | "muted" | "inactive";
type PreviewTone = "info" | "success" | "warning";

const IN_APP_NOTIFICATION_TOAST_MS = 6500;
const IN_APP_WARNING_NOTIFICATION_TOAST_MS = 9000;

function getInAppNotificationDuration(tone?: PreviewTone) {
  if (tone === "warning") return IN_APP_WARNING_NOTIFICATION_TOAST_MS;
  return IN_APP_NOTIFICATION_TOAST_MS;
}

function getInAppNotificationIcon(tone?: PreviewTone) {
  if (tone === "warning") return <ShieldAlert className="h-4 w-4 text-warning-foreground" />;
  if (tone === "success") return <BadgeCheck className="h-4 w-4 text-success-foreground" />;
  return <BellRing className="h-4 w-4 text-primary" />;
}

function renderInAppToastContent({
  title,
  description,
  tone,
  actionLabel,
  onClose,
}: {
  title: string;
  description?: string;
  tone?: PreviewTone;
  actionLabel?: string;
  onClose?: () => void;
}) {
  return (
    <div className="w-[min(420px,calc(100vw-32px))] rounded-xl border border-line bg-card p-4 text-card-foreground ring-1 ring-[hsl(var(--soft-ring))]">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
            tone === "success" && "border-success-soft-border bg-success-soft text-success-foreground",
            tone === "warning" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
            (!tone || tone === "info") && "border-info-soft-border bg-info-soft text-info-foreground"
          )}
        >
          {getInAppNotificationIcon(tone)}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Закрити сповіщення"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {description ? <div className="text-sm leading-5 text-muted-foreground">{description}</div> : null}
          <div className="flex items-center justify-end gap-3 pt-1">
            {actionLabel ? (
              <span className="inline-flex h-8 items-center rounded-full border border-line bg-background px-3 text-xs font-semibold text-foreground">
                {actionLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Налаштування сповіщень: push, popup, звук і канали за типами. Винесено зі
 * сторінки «Вхідні» (REQ-346#p2) як є — кожен тумблер зберігається одразу.
 */
export function NotificationSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { userId, accessRole, jobRole } = useAuth();
  const push = usePushNotifications(userId);
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] = useState(() => readInAppNotificationPreferences().enabled);
  const [inAppNotificationSoundEnabled, setInAppNotificationSoundEnabled] = useState(
    () => readInAppNotificationPreferences().soundEnabled
  );
  const [soundDebug, setSoundDebug] = useState<SoundDebugState>({ level: "idle", message: "" });
  const [telegramLinked, setTelegramLinked] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    (async () => {
      const { data } = await db
        .from("user_notification_settings" as never)
        .select("telegram_chat_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      const row = data as unknown as { telegram_chat_id?: string | null } | null;
      setTelegramLinked(row?.telegram_chat_id != null);
    })();
    return () => {
      active = false;
    };
  }, [open, userId]);

  // useCallback, щоб клік-хендлери нижче могли тримати її в deps без
  // перестворення щорендер (writeInAppNotificationPreferences — модульний
  // імпорт, сетери стабільні; залежить лише від двох поточних значень).
  const updateInAppNotificationPreferences = useCallback(
    (next: { enabled?: boolean; soundEnabled?: boolean }) => {
      const resolved = {
        enabled: next.enabled ?? inAppNotificationsEnabled,
        soundEnabled: next.soundEnabled ?? inAppNotificationSoundEnabled,
      };
      const normalized = {
        enabled: resolved.enabled,
        soundEnabled: resolved.enabled ? resolved.soundEnabled : false,
      };
      setInAppNotificationsEnabled(normalized.enabled);
      setInAppNotificationSoundEnabled(normalized.soundEnabled);
      writeInAppNotificationPreferences(normalized);
    },
    [inAppNotificationsEnabled, inAppNotificationSoundEnabled]
  );

  const playInAppNotificationSound = useCallback(async (force = false) => {
    if (!inAppNotificationSoundEnabled) {
      return { ok: false, message: "Звук вимкнений у налаштуваннях" };
    }
    return playNotificationSound({ force });
  }, [inAppNotificationSoundEnabled]);

  const showInAppPreview = useCallback((tone: PreviewTone) => {
    const variants: Record<PreviewTone, { title: string; description: string; actionLabel: string }> = {
      info: {
        title: "Нове сповіщення в CRM",
        description: "Менеджер залишив коментар у задачі. Popup з’явиться так само, як при реальній події.",
        actionLabel: "До задачі",
      },
      success: {
        title: "Задачу оновлено",
        description: "Дизайн переведено в готовий. Так виглядатиме сповіщення про успішну зміну стану.",
        actionLabel: "Відкрити",
      },
      warning: {
        title: "Потрібна увага",
        description: "Замовник повернув правки. Важливі події можуть показуватись довше й з іншим акцентом.",
        actionLabel: "Переглянути",
      },
    };

    const preview = variants[tone];
    toast.custom(
      (t) =>
        renderInAppToastContent({
          title: preview.title,
          description: preview.description,
          tone,
          actionLabel: preview.actionLabel,
          onClose: () => toast.dismiss(t),
        }),
      {
        id: `notification-preview:${tone}:${Date.now()}`,
        position: "top-right",
        duration: getInAppNotificationDuration(tone),
        className: "!border-0 !bg-transparent !p-0 !",
      }
    );

    void playInAppNotificationSound();
  }, [playInAppNotificationSound]);

  const pushStatusLabel = !push.supported
    ? "Недоступно"
    : push.enabled
      ? "Увімкнено"
      : push.configured
        ? "Вимкнено"
        : "Потрібен дозвіл";

  const pushStatusTone: SettingsTone = !push.supported
    ? "inactive"
    : push.enabled
      ? "active"
      : "muted";

  const inAppStatusLabel = inAppNotificationsEnabled ? "Увімкнено" : "Вимкнено";
  const inAppStatusTone: SettingsTone = inAppNotificationsEnabled ? "active" : "muted";

  const soundStatusLabel = !inAppNotificationsEnabled
    ? "Недоступно"
    : inAppNotificationSoundEnabled
      ? "Увімкнено"
      : "Вимкнено";

  const soundStatusTone: SettingsTone = !inAppNotificationsEnabled
    ? "inactive"
    : inAppNotificationSoundEnabled
      ? "active"
      : "muted";

  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/* Кожен тумблер зберігається одразу — кнопки «Зберегти» тут немає,
        тож закриття кліком повз нічого не втрачає. */}
    <DialogContent dismissible className="max-h-[92dvh] w-[calc(100vw-0.75rem)] max-w-[760px] overflow-y-auto p-3 sm:max-h-[88dvh] sm:w-auto sm:p-6">
      <DialogHeader>
        <DialogTitle>Налаштування сповіщень</DialogTitle>
        <DialogDescription className="hidden sm:block">
          Тут можна керувати браузерним push, popup-сповіщеннями всередині CRM, звуком і одразу протестувати, як це виглядає.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2.5 sm:space-y-3">
        <section className="rounded-inner border border-line bg-background px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-primary/5 text-primary">
                  <BellRing className="h-4 w-4" />
                </div>
                <div className="min-w-0 max-w-2xl">
                  <div className="text-sm font-semibold text-foreground sm:text-base">Push у браузері</div>
                  <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                    Працює, коли вкладка неактивна або браузер згорнутий.
                  </div>
                </div>
              </div>
              <span className={cn(
                "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-2xs font-semibold md:hidden",
                pushStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                pushStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                pushStatusTone === "inactive" && "border-line bg-muted/60 text-muted-foreground"
              )}>
                {pushStatusLabel}
              </span>
            </div>
            <div className="flex w-full flex-col gap-3 md:min-w-[320px] md:max-w-[320px]">
              <div className="hidden items-center justify-end gap-3 md:flex">
                <span className={cn(
                  "inline-flex rounded-full border px-2.5 py-1 text-2xs font-semibold",
                  pushStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                  pushStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                  pushStatusTone === "inactive" && "border-line bg-muted/60 text-muted-foreground"
                )}>
                  {pushStatusLabel}
                </span>
              </div>
              {push.supported && push.configured ? (
                <div className="flex items-center justify-start gap-3 md:justify-end">
                  <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-start md:justify-end">
                    <Button
                      variant="outline"
                      className="w-full text-sm sm:w-auto"
                      onClick={push.sendTest}
                      disabled={push.busy || !push.enabled}
                    >
                      Тест push
                    </Button>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={push.enabled}
                        disabled={push.busy}
                        onCheckedChange={() => (push.enabled ? push.disable() : push.enable())}
                        label="Перемкнути push у браузері"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {push.enabled ? "Увімкнено" : "Вимкнено"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs leading-5 text-muted-foreground">
                  Поточний браузер не підтримує push або ще не надано дозвіл.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-inner border border-line bg-background px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-primary/5 text-primary">
                  <MonitorSmartphone className="h-4 w-4" />
                </div>
                <div className="min-w-0 max-w-2xl">
                  <div className="text-sm font-semibold text-foreground sm:text-base">In-app popup</div>
                  <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                    З’являється у правому верхньому куті, поки ви працюєте всередині CRM.
                  </div>
                </div>
              </div>
              <span className={cn(
                "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-2xs font-semibold md:hidden",
                inAppStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                inAppStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground"
              )}>
                {inAppStatusLabel}
              </span>
            </div>
            <div className="flex flex-col items-start gap-3 md:min-w-[280px] md:items-end">
              <span className={cn(
                "hidden rounded-full border px-2.5 py-1 text-2xs font-semibold md:inline-flex",
                inAppStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                inAppStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground"
              )}>
                {inAppStatusLabel}
              </span>
              <div className="flex w-full items-center gap-3 md:min-w-[280px] md:justify-end">
                <Switch
                  checked={inAppNotificationsEnabled}
                  onCheckedChange={() => updateInAppNotificationPreferences({ enabled: !inAppNotificationsEnabled })}
                  label="Перемкнути in-app popup"
                />
                <span className="text-sm font-medium text-foreground">
                  {inAppNotificationsEnabled ? "Увімкнено" : "Вимкнено"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-inner border border-line bg-background px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-primary/5 text-primary">
                  <Volume2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 max-w-2xl">
                  <div className="text-sm font-semibold text-foreground sm:text-base">Звук</div>
                  <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                    Делікатний сигнал для нових popup-сповіщень усередині CRM.
                  </div>
                </div>
              </div>
              <span className={cn(
                "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-2xs font-semibold md:hidden",
                soundStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                soundStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                soundStatusTone === "inactive" && "border-line bg-muted/60 text-muted-foreground"
              )}>
                {soundStatusLabel}
              </span>
            </div>
            <div className="flex flex-col items-start gap-3 md:min-w-[320px] md:items-end">
              <span className={cn(
                "hidden rounded-full border px-2.5 py-1 text-2xs font-semibold md:inline-flex",
                soundStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                soundStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                soundStatusTone === "inactive" && "border-line bg-muted/60 text-muted-foreground"
              )}>
                {soundStatusLabel}
              </span>
              <div className="flex w-full flex-col items-start gap-2 md:min-w-[320px] md:items-end">
                <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-start md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-sm sm:w-auto"
                    disabled={!inAppNotificationsEnabled}
                    onClick={async () => {
                      const result = await playInAppNotificationSound(true);
                      setSoundDebug({
                        level: result.ok ? "success" : "error",
                        message: result.message,
                      });
                    }}
                  >
                    Тест звуку
                  </Button>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={inAppNotificationSoundEnabled}
                      disabled={!inAppNotificationsEnabled}
                      onCheckedChange={() =>
                        updateInAppNotificationPreferences({ soundEnabled: !inAppNotificationSoundEnabled })
                      }
                      label="Перемкнути звук сповіщень"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {inAppNotificationSoundEnabled ? "Увімкнено" : "Вимкнено"}
                    </span>
                  </div>
                </div>
                {soundDebug.message ? (
                  <div
                    className={cn(
                      "text-xs",
                      soundDebug.level === "success" && "text-success-foreground",
                      soundDebug.level === "error" && "text-danger-foreground"
                    )}
                  >
                    {soundDebug.message}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-inner border border-line bg-background px-3 py-3 sm:px-4 sm:py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-primary/5 text-primary">
              <Send className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground sm:text-base">Типи сповіщень по каналах</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Обери, які сповіщення слати в push і Telegram.
                {!telegramLinked ? " Telegram підключається у профілі." : ""}
              </div>
            </div>
          </div>
          <NotificationChannelMatrix
            userId={userId}
            accessRole={accessRole}
            jobRole={jobRole}
            telegramLinked={telegramLinked}
          />
        </section>
      </div>

      <div className="rounded-inner border border-line bg-background/68 p-3 sm:p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground sm:text-base">Тест in-app popup</div>
            <div className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
              Перевіряє вигляд popup, різні іконки та звук. Можна натиснути кілька разів підряд, щоб побачити стек сповіщень.
            </div>
          </div>
          <Badge variant="secondary" className="hidden w-fit bg-background/80 sm:inline-flex">Тільки для перевірки</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
          <Button type="button" variant="outline" className="w-full text-sm sm:w-auto" onClick={() => showInAppPreview("info")}>
            Звичайне
          </Button>
          <Button type="button" variant="outline" className="w-full text-sm sm:w-auto" onClick={() => showInAppPreview("success")}>
            Успішне
          </Button>
          <Button type="button" variant="outline" className="w-full text-sm sm:w-auto" onClick={() => showInAppPreview("warning")}>
            Важливе
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
  );
}
