import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListSkeleton } from "@/components/app/page-skeleton-templates";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { AvatarBase } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import {
  formatActivityClock,
  formatActivityDayLabel,
  mapActivityRow,
  type ActivityItem,
  type ActivityRow,
} from "@/lib/activity";
import { listTeamMembers } from "@/lib/toshoApi";
import { Activity, FileText, Palette, Users, Wallet } from "lucide-react";

type FilterMode = "all" | "quotes" | "design" | "finance" | "team" | "other";
type ActivityPageCache = {
  items: ActivityItem[];
};

export default function ActivityPage() {
  const navigate = useNavigate();
  const { teamId, userId } = useAuth();
  const { cached, setCache } = usePageCache<ActivityPageCache>("activity");
  const hasCache = Boolean(cached);
  
  const [items, setItems] = useState<ActivityItem[]>(cached?.items ?? []);
  const [loading, setLoading] = useState(!hasCache);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
    }
  }, [hasCache, loading]);

  useEffect(() => {
    async function load() {
      if (!teamId) return;
      if (!hasCache) {
        setLoading(true);
      }
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, team_id, user_id, actor_name, action, entity_type, entity_id, title, href, metadata, created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        const rows = (data || []) as ActivityRow[];
        const mapped = rows.map(mapActivityRow);
        const cachedById = new Map(
          (cached?.items ?? []).filter((item) => item.user_id).map((item) => [item.user_id as string, item])
        );
        const hydrated = mapped.map((item) => {
          if (!item.user_id || item.avatar_url) return item;
          const cachedItem = cachedById.get(item.user_id);
          if (!cachedItem) return item;
          return {
            ...item,
            avatar_url: cachedItem.avatar_url ?? null,
            actor: item.actor || cachedItem.actor,
          };
        });
        setItems(hydrated);
        const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
        if (userIds.length > 0) {
          try {
            const teamMembers = await listTeamMembers(teamId);
            const byId = new Map(
              teamMembers.map((m) => [
                m.id,
                { user_id: m.id, avatar_url: m.avatarUrl ?? null, full_name: m.label },
              ])
            );
            const enriched = hydrated.map((item) => {
              if (!item.user_id) return item;
              const member = byId.get(item.user_id);
              if (!member) return item;
              return {
                ...item,
                avatar_url: member.avatar_url ?? null,
                actor: item.actor || member.full_name || item.actor,
              };
            });
            setItems(enriched);
            setCache({ items: enriched });
          } catch {
            setItems(hydrated);
            setCache({ items: hydrated });
          }
        } else {
          setItems(hydrated);
          setCache({ items: hydrated });
        }
      }
      setLoading(false);
    }
    if (teamId) {
      load();
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    async function markRead() {
      if (!teamId || !userId) return;
      await supabase
        .from("activity_read_state")
        .upsert(
          { team_id: teamId, user_id: userId, last_seen_at: new Date().toISOString() },
          { onConflict: "team_id,user_id" }
        );
      window.dispatchEvent(new Event("activity_read"));
    }
    markRead();
  }, [teamId, userId]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.type === filter);
  }, [items, filter]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, ActivityItem[]>();
    filtered.forEach((item) => {
      const label = formatActivityDayLabel(item.created_at);
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)?.push(item);
    });
    return Array.from(buckets.entries());
  }, [filtered]);

  const headerActions = useMemo(
    () => (
      <Button variant="secondary" onClick={() => navigate("/notifications")}>
        Сповіщення
      </Button>
    ),
    [navigate]
  );

  usePageHeaderActions(headerActions, [navigate]);

  const showSkeleton = useMinimumLoading(loading);

  if (showSkeleton) {
    return <ListSkeleton />;
  }

  const iconForItem = (item: ActivityItem) => {
    if (item.type === "quotes") return FileText;
    if (item.type === "design") return Palette;
    if (item.type === "finance") return Wallet;
    if (item.type === "team") return Users;
    return Activity;
  };

  const badgeForItem = (item: ActivityItem) => {
    if (item.type === "quotes") return { label: "Прорахунки", tone: "info" as const };
    if (item.type === "design") return { label: "Дизайн", tone: "success" as const };
    if (item.type === "finance") return { label: "Фінанси", tone: "danger" as const };
    if (item.type === "team") return { label: "Команда", tone: "neutral" as const };
    return { label: "Інше", tone: "neutral" as const };
  };

  const initialsForItem = (item: ActivityItem) => {
    const actor = item.actor ?? "Користувач";
    const parts = actor.split(" ").filter(Boolean);
    const initials = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : actor.slice(0, 2);
    return initials.toUpperCase();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/60 p-5">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Активність команди</div>
            <div className="mt-0.5 text-sm text-muted-foreground">Усі події та зміни в одному місці</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <TabsList
              className={cn(
                "inline-flex h-10 items-center rounded-[var(--radius-inner)] p-1",
                "bg-muted/70 border border-border shadow-inner"
              )}
            >
              <TabsTrigger
                value="all"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Всі
              </TabsTrigger>
              <TabsTrigger
                value="quotes"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Прорахунки
              </TabsTrigger>
              <TabsTrigger
                value="design"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Дизайн
              </TabsTrigger>
              <TabsTrigger
                value="finance"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Фінанси
              </TabsTrigger>
              <TabsTrigger
                value="team"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Команда
              </TabsTrigger>
              <TabsTrigger
                value="other"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Інше
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-6">
          {filtered.length === 0 ? (
            <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Поки немає дій.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([label, dayItems]) => (
                <div key={label} className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <div className="space-y-3">
                    {dayItems.map((item) => {
                      const Icon = iconForItem(item);
                      const badge = badgeForItem(item);
                      return (
                        <Button
                          key={item.id}
                          type="button"
                          variant="card"
                          size="md"
                          onClick={() => item.href && navigate(item.href)}
                          className={cn(
                            "h-auto p-5",
                            "hover:shadow-[var(--shadow-floating)]"
                          )}
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex items-center gap-3 pt-0.5">
                              <AvatarBase
                                src={item.avatar_url}
                                name={item.actor || item.title || "User"}
                                fallback={initialsForItem(item)}
                                variant="sm"
                              />
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
                                <Icon className="h-5 w-5" />
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-foreground truncate">
                                  {item.title}
                                </span>
                                <Badge tone={badge.tone} size="sm" pill>
                                  {badge.label}
                                </Badge>
                              </div>
                              {item.actor ? (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Зробив: <span className="font-medium text-foreground">{item.actor}</span>
                                </div>
                              ) : null}
                            </div>

                            <div className="self-start pt-0.5 text-xs text-muted-foreground whitespace-nowrap">
                              {formatActivityClock(item.created_at)}
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
