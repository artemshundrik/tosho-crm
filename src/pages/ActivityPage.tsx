import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  formatActivityClock,
  formatActivityDayLabel,
  mapActivityRow,
  type ActivityItem,
  type ActivityRow,
} from "@/lib/activity";
import { Activity, CalendarDays, Trophy, UserPlus, Users, Wallet, Dumbbell } from "lucide-react";

type FilterMode = "all" | "matches" | "trainings" | "finance" | "team";

export default function ActivityPage() {
  const navigate = useNavigate();
  const { teamId, userId } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    async function load() {
      if (!teamId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, team_id, user_id, actor_name, action, entity_type, entity_id, title, href, created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        setItems(((data || []) as ActivityRow[]).map(mapActivityRow));
      }
      setLoading(false);
    }
    load();
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

  const iconForItem = (item: ActivityItem) => {
    const title = item.title.toLowerCase();
    if (title.includes("інвайт")) return UserPlus;
    if (item.type === "trainings") return Dumbbell;
    if (item.type === "matches") return Trophy;
    if (item.type === "finance") return Wallet;
    if (item.type === "team") return Users;
    return Activity;
  };

  const badgeForItem = (item: ActivityItem) => {
    const title = item.title.toLowerCase();
    if (title.includes("інвайт")) return { label: "Інвайти", tone: "info" as const };
    if (item.type === "trainings") return { label: "Тренування", tone: "info" as const };
    if (item.type === "matches") return { label: "Матчі", tone: "success" as const };
    if (item.type === "finance") return { label: "Фінанси", tone: "danger" as const };
    if (item.type === "team") return { label: "Команда", tone: "neutral" as const };
    return { label: "Активність", tone: "neutral" as const };
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                value="matches"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Матчі
              </TabsTrigger>
              <TabsTrigger
                value="trainings"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Тренування
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
            </TabsList>
          </Tabs>

          <Button variant="outline" className="h-10 px-4" onClick={() => navigate("/notifications")}>
            Сповіщення
          </Button>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Завантаження...
            </div>
          ) : filtered.length === 0 ? (
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
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => item.href && navigate(item.href)}
                          className={cn(
                            "w-full text-left rounded-[var(--radius-inner)] border border-border bg-card/60 p-5 transition-all",
                            "hover:bg-muted/40 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
                          )}
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex items-center gap-3 pt-0.5">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60 text-xs font-semibold text-muted-foreground">
                                {initialsForItem(item)}
                              </div>
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
                                <Icon className="h-5 w-5" />
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground truncate">{item.title}</span>
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

                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatActivityClock(item.created_at)}
                            </div>
                          </div>
                        </button>
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
