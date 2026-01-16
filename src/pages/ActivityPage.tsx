import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import {
  formatActivityClock,
  formatActivityDayLabel,
  mapActivityRow,
  type ActivityItem,
  type ActivityRow,
} from "@/lib/activity";
import { Activity, CalendarDays, Trophy, UserPlus, Users, Wallet, Dumbbell } from "lucide-react";

type FilterMode = "all" | "matches" | "trainings" | "finance" | "team";
type MemberAvatar = { user_id: string; avatar_url: string | null; full_name: string | null };
type TitleParts = { title: string; eventLine?: string };

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
        .select("id, team_id, user_id, actor_name, action, entity_type, entity_id, title, href, metadata, created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error) {
        const rows = (data || []) as ActivityRow[];
        const mapped = rows.map(mapActivityRow);
        setItems(mapped);
        const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
        if (userIds.length > 0) {
          const { data: members, error: membersError } = await supabase
            .from("team_members_view")
            .select("user_id, avatar_url, full_name")
            .eq("team_id", teamId)
            .in("user_id", userIds);
          if (!membersError && members) {
            const byId = new Map((members as MemberAvatar[]).map((m) => [m.user_id, m]));
            setItems(
              mapped.map((item) => {
                if (!item.user_id) return item;
                const member = byId.get(item.user_id);
                if (!member) return item;
                return {
                  ...item,
                  avatar_url: member.avatar_url ?? null,
                  actor: item.actor || member.full_name || item.actor,
                };
              })
            );
          }
        }
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

  const headerActions = useMemo(
    () => (
      <Button variant="secondary" onClick={() => navigate("/notifications")}>
        Сповіщення
      </Button>
    ),
    [navigate]
  );

  usePageHeaderActions(headerActions, [navigate]);

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

  const parseEventDateTime = (text: string) => {
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const dmMatch = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/);
    const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : null;
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      return { date: new Date(year, month - 1, day), time };
    }
    if (dmMatch) {
      const day = Number(dmMatch[1]);
      const month = Number(dmMatch[2]);
      const year = dmMatch[3] ? Number(dmMatch[3]) : new Date().getFullYear();
      return { date: new Date(year, month - 1, day), time };
    }
    return { date: null, time };
  };

  const parseEventDate = (value: string | null | undefined) => {
    if (!value) return null;
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const dm = value.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
    if (dm) return new Date(Number(dm[3] || new Date().getFullYear()), Number(dm[2]) - 1, Number(dm[1]));
    return null;
  };

  const formatEventDateLabel = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const weekday = new Intl.DateTimeFormat("uk-UA", { weekday: "long" }).format(date);
    const weekdayLabel = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return { dateLabel: `${day}.${month}`, weekdayLabel };
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const stripDateTime = (text: string) =>
    text
      .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "")
      .replace(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/g, "")
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, "")
      .replace(/\s+/g, " ")
      .replace(/[(),–—-]+\s*$/g, "")
      .trim();

  const getTitleParts = (item: ActivityItem): TitleParts => {
    const title = item.title.trim();
    const isTraining = item.type === "trainings" || title.toLowerCase().includes("тренуван");
    const isMatch = item.type === "matches" || title.toLowerCase().includes("матч");
    const metaDate = parseEventDate(item.event_date);
    const metaTime = item.event_time || null;
    const { date: fallbackDate, time: fallbackTime } = parseEventDateTime(title);
    const date = metaDate ?? fallbackDate;
    const time = metaTime ?? fallbackTime;
    if (isTraining && date) {
      return {
        title: "Тренування",
        eventLine: `${formatEventDateLabel(date).dateLabel} (${formatEventDateLabel(date).weekdayLabel})${
          time ? ` о ${time}` : ""
        }`,
      };
    }

    if (isMatch) {
      const opponentMatch = title.match(/проти\s+(.+)/i);
      const opponentRaw = opponentMatch ? opponentMatch[1] : title.replace(/матч[:\s]+/i, "");
      const opponent = stripDateTime(opponentRaw);
      if (date) {
        return {
          title: opponent ? `Матч: ${opponent}` : title,
          eventLine: `${formatEventDateLabel(date).dateLabel} (${formatEventDateLabel(date).weekdayLabel})${
            time ? ` о ${time}` : ""
          }`,
        };
      }
      return { title: opponent ? `Матч: ${opponent}` : title };
    }

    return { title };
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
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={`activity-skel-${idx}`} className="h-14 rounded-[var(--radius-inner)]" />
              ))}
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
                      const titleParts = getTitleParts(item);
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
                              <Avatar className="h-10 w-10 border border-border bg-muted/60">
                                <AvatarImage src={item.avatar_url || ""} />
                                <AvatarFallback className="text-xs font-semibold text-muted-foreground">
                                  {initialsForItem(item)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
                                <Icon className="h-5 w-5" />
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-foreground truncate">
                                  {titleParts.title}
                                </span>
                                <Badge tone={badge.tone} size="sm" pill>
                                  {badge.label}
                                </Badge>
                              </div>
                              {titleParts.eventLine ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {titleParts.eventLine}
                                </div>
                              ) : null}
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
