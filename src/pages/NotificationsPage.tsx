import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";

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
        () => {
          void loadNotifications(false);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId]);

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

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  const openNotification = async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <TabsList
              className={cn(
                "inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1",
                "bg-muted border border-border"
              )}
            >
              <TabsTrigger
                value="all"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Всі
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Непрочитані
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
