import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BadgeCheck, BellRing, MonitorSmartphone, Settings2, ShieldAlert, Volume2, X as CloseIcon } from "lucide-react";
import { toast } from "sonner";
import {
  disableRealtimeForSession,
  enableRealtimeForSession,
  isRealtimeDisabledForSession,
  supabase,
} from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER, TOOLBAR_ACTION_BUTTON } from "@/components/ui/controlStyles";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notificationSound";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  readInAppNotificationPreferences,
  writeInAppNotificationPreferences,
} from "@/lib/inAppNotificationPreferences";

type FilterMode = "all" | "unread";
type SoundDebugState = {
  level: "idle" | "success" | "error";
  message: string;
};

type NotificationsPageCache = {
  notifications: NotificationItem[];
};

const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

type SettingsTone = "active" | "muted" | "inactive";
type PreviewTone = "info" | "success" | "warning";

const IN_APP_NOTIFICATION_TOAST_MS = 6500;
const IN_APP_WARNING_NOTIFICATION_TOAST_MS = 9000;
const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;

function isDocumentVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

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
    <div className="w-[min(420px,calc(100vw-32px))] rounded-[24px] border border-border bg-card p-4 text-card-foreground ring-1 ring-[hsl(var(--soft-ring))] shadow-[var(--shadow-elevated-lg)]">
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
            <div className="text-[15px] font-semibold leading-5 text-foreground">{title}</div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Закрити сповіщення"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {description ? <div className="text-sm leading-5 text-muted-foreground">{description}</div> : null}
          <div className="flex items-center justify-end gap-3 pt-1">
            {actionLabel ? (
              <span className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground">
                {actionLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled = false,
  onClick,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        checked && "border-primary/35 bg-primary",
        !checked && "border-border bg-muted/80",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function statusPillClass(tone: SettingsTone) {
  return cn(
    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium",
    tone === "active" && "border-primary/25 bg-primary/10 text-primary",
    tone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
    tone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
  );
}

function renderNotificationDescription(text: string): ReactNode {
  const parts = text.split(MENTION_TOKEN_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!part.startsWith("@")) return <span key={`part-${index}`}>{part}</span>;
    return (
      <span key={`part-${index}`} className="font-semibold text-primary">
        {part}
      </span>
    );
  });
}

export default function NotificationsPage() {
  const { userId } = useAuth();
  const push = usePushNotifications(userId);
  const location = useLocation();
  const navigate = useNavigate();
  const { cached, setCache } = usePageCache<NotificationsPageCache>("notifications");
  const hasCache = Boolean(cached);
  
  const [notifications, setNotifications] = useState<NotificationItem[]>(cached?.notifications ?? []);
  const [loading, setLoading] = useState(!hasCache);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [realtimeDisabled, setRealtimeDisabled] = useState(() => isRealtimeDisabledForSession());
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] = useState(() => readInAppNotificationPreferences().enabled);
  const [inAppNotificationSoundEnabled, setInAppNotificationSoundEnabled] = useState(
    () => readInAppNotificationPreferences().soundEnabled
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundDebug, setSoundDebug] = useState<SoundDebugState>({ level: "idle", message: "" });

  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);

  const loadNotifications = useCallback(
    async (showLoader = false) => {
      if (!userId) return;
      if (showLoader) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, href, created_at, read_at, type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        const mapped = ((data || []) as NotificationRow[]).map(mapNotificationRow);
        setNotifications(mapped);
        setCache({ notifications: mapped });
      } else {
        setNotifications([]);
        setCache({ notifications: [] });
      }
      if (showLoader) {
        setLoading(false);
      }
    },
    [setCache, userId]
  );

  useEffect(() => {
    void loadNotifications(!hasCache);
  }, [hasCache, loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    if (!realtimeDisabled) return;
    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadNotifications(false);
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications, realtimeDisabled, userId]);

  useEffect(() => {
    if (realtimeDisabled) return;
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-page:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" && location.pathname.startsWith("/notifications")) {
            const row = payload.new as NotificationRow;
            const item = mapNotificationRow(row);
            toast(item.title || "Нове сповіщення", {
              description: item.description?.trim() || undefined,
            });
          }
          void loadNotifications(false);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enableRealtimeForSession();
          setRealtimeDisabled(false);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          disableRealtimeForSession();
          setRealtimeDisabled(true);
          void loadNotifications(false);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, location.pathname, realtimeDisabled, userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, filter]);

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) {
      toast.error("Не вдалося оновити сповіщення");
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Усі сповіщення прочитані");
  }, [unreadCount, userId]);

  const showSkeleton = useMinimumLoading(loading);

  const openNotification = async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  };

  const updateInAppNotificationPreferences = (next: { enabled?: boolean; soundEnabled?: boolean }) => {
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
  };

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
        className: "!border-0 !bg-transparent !p-0 !shadow-none",
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

  const notificationsHeaderActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topLeft={
          <div className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={SEGMENTED_TRIGGER}
            >
              Всі
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
              className={SEGMENTED_TRIGGER}
            >
              Непрочитані
            </Button>
          </div>
        }
        topRight={
          <>
            <div className="text-sm font-semibold text-foreground">
              {filtered.length}
              <span className="ml-1 text-muted-foreground">знайдено</span>
            </div>
            <Button
              variant="secondary"
              className={TOOLBAR_ACTION_BUTTON}
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Позначити всі
            </Button>
          </>
        }
      />
    ),
    [filter, filtered.length, markAllRead, unreadCount]
  );

  usePageHeaderActions(notificationsHeaderActions, [notificationsHeaderActions]);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/70 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">Центр сповіщень</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Усі канали керування зібрані в одному місці, без зайвого шуму на сторінці.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={statusPillClass(pushStatusTone)}>
              <BellRing className="h-4 w-4" />
              <span>Push</span>
              <span className="opacity-80">{pushStatusLabel}</span>
            </div>
            <div className={statusPillClass(inAppStatusTone)}>
              <MonitorSmartphone className="h-4 w-4" />
              <span>Popup</span>
              <span className="opacity-80">{inAppStatusLabel}</span>
            </div>
            <div className={statusPillClass(soundStatusTone)}>
              <Volume2 className="h-4 w-4" />
              <span>Звук</span>
              <span className="opacity-80">{soundStatusLabel}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSettingsOpen(true)}
              title="Налаштувати сповіщення"
              aria-label="Налаштувати сповіщення"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Налаштування сповіщень</DialogTitle>
            <DialogDescription>
              Тут можна керувати браузерним push, popup-сповіщеннями всередині CRM, звуком і одразу протестувати, як це виглядає.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full border border-border bg-primary/5 p-2 text-primary">
                    <BellRing className="h-4 w-4" />
                  </div>
                  <div className="max-w-2xl">
                    <div className="text-sm font-semibold text-foreground">Push у браузері</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      Працює, коли вкладка неактивна або браузер згорнутий.
                    </div>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 md:min-w-[320px] md:max-w-[320px]">
                  <div className="flex items-center justify-end gap-3">
                    <span className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      pushStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                      pushStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                      pushStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                    )}>
                      {pushStatusLabel}
                    </span>
                  </div>
                  {push.supported && push.configured ? (
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          className="h-9"
                          onClick={push.sendTest}
                          disabled={push.busy || !push.enabled}
                        >
                          Тест push
                        </Button>
                        <Toggle
                          checked={push.enabled}
                          disabled={push.busy}
                          onClick={push.enabled ? push.disable : push.enable}
                          label="Перемкнути push у браузері"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {push.enabled ? "Увімкнено" : "Вимкнено"}
                        </span>
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

            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full border border-border bg-primary/5 p-2 text-primary">
                    <MonitorSmartphone className="h-4 w-4" />
                  </div>
                  <div className="max-w-2xl">
                    <div className="text-sm font-semibold text-foreground">In-app popup</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      З’являється у правому верхньому куті, поки ви працюєте всередині CRM.
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 md:min-w-[280px] md:items-end">
                  <span className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    inAppStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    inAppStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground"
                  )}>
                    {inAppStatusLabel}
                  </span>
                  <div className="flex w-full items-center gap-3 md:min-w-[280px] md:justify-end">
                    <Toggle
                      checked={inAppNotificationsEnabled}
                      onClick={() => updateInAppNotificationPreferences({ enabled: !inAppNotificationsEnabled })}
                      label="Перемкнути in-app popup"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {inAppNotificationsEnabled ? "Увімкнено" : "Вимкнено"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[var(--radius-inner)] border border-border/70 bg-background px-4 py-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full border border-border bg-primary/5 p-2 text-primary">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <div className="max-w-2xl">
                    <div className="text-sm font-semibold text-foreground">Звук</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      Делікатний сигнал для нових popup-сповіщень усередині CRM.
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 md:min-w-[320px] md:items-end">
                  <span className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    soundStatusTone === "active" && "border-primary/25 bg-primary/10 text-primary",
                    soundStatusTone === "muted" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
                    soundStatusTone === "inactive" && "border-border bg-muted/60 text-muted-foreground"
                  )}>
                    {soundStatusLabel}
                  </span>
                  <div className="flex w-full flex-col items-end gap-2 md:min-w-[320px]">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
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
                      <Toggle
                        checked={inAppNotificationSoundEnabled}
                        disabled={!inAppNotificationsEnabled}
                        onClick={() =>
                          updateInAppNotificationPreferences({ soundEnabled: !inAppNotificationSoundEnabled })
                        }
                        label="Перемкнути звук сповіщень"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {inAppNotificationSoundEnabled ? "Увімкнено" : "Вимкнено"}
                      </span>
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
          </div>

          <div className="rounded-[var(--radius-inner)] border border-border/70 bg-background/68 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Тест in-app popup</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  Перевіряє вигляд popup, різні іконки та звук. Можна натиснути кілька разів підряд, щоб побачити стек сповіщень.
                </div>
              </div>
              <Badge variant="secondary" className="w-fit bg-background/80">Тільки для перевірки</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-9" onClick={() => showInAppPreview("info")}>
                Тест звичайного
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => showInAppPreview("success")}>
                Тест успішного
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => showInAppPreview("warning")}>
                Тест важливого
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-section)] border border-border bg-card/82 p-6 text-center text-sm text-muted-foreground">
          Поки немає сповіщень.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <Button
              key={n.id}
              type="button"
              variant="card"
              size="md"
              onClick={() => openNotification(n)}
              className={cn(
                "h-auto p-4",
                !n.read && "shadow-[var(--shadow-surface)]"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        !n.read && n.tone === "success" && "tone-dot-success",
                        !n.read && n.tone === "warning" && "tone-dot-warning",
                        !n.read && n.tone === "info" && "tone-dot-info",
                        !n.read && !n.tone && "bg-muted-foreground",
                        n.read && "bg-muted-foreground/40"
                      )}
                    />
                    <div className="text-sm font-semibold text-foreground truncate">{n.title}</div>
                    {!n.read ? <Badge variant="secondary">Нове</Badge> : null}
                  </div>
                  {n.description ? (
                    <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {renderNotificationDescription(n.description)}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{n.time}</div>
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
