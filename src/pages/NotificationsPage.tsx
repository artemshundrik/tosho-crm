import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type FilterMode = "all" | "unread";

type NotificationsPageCache = {
  notifications: NotificationItem[];
};

const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, location.pathname, userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (filter === "unread") return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, filter]);

  const markAllRead = async () => {
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
  };

  const showSkeleton = useMinimumLoading(loading);

  const openNotification = async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  };

  const notificationsHeaderActions = useMemo(() => (
    <div className="space-y-3 px-4 py-3 md:px-5 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] border border-border bg-muted p-1">
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Всі
          </Button>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Непрочитані
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {push.supported && push.configured ? (
            <Button
              variant={push.enabled ? "secondary" : "outline"}
              className="h-10 px-4"
              onClick={push.enabled ? push.disable : push.enable}
              disabled={push.busy}
            >
              {push.enabled ? "Push увімкнено" : "Увімкнути push"}
            </Button>
          ) : null}
          <div className="text-sm font-semibold text-foreground">
            {filtered.length}
            <span className="ml-1 text-muted-foreground">знайдено</span>
          </div>
          <Button
            variant="secondary"
            className="h-10 px-4"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            Позначити всі
          </Button>
        </div>
      </div>
    </div>
  ), [filter, filtered.length, push.busy, push.configured, push.enabled, push.supported, unreadCount, push.disable, push.enable]);

  usePageHeaderActions(notificationsHeaderActions, [notificationsHeaderActions]);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20 md:pb-0 space-y-6">
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-section)] border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
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
                        !n.read && n.tone === "success" && "bg-emerald-500",
                        !n.read && n.tone === "warning" && "bg-amber-500",
                        !n.read && n.tone === "info" && "bg-sky-500",
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
