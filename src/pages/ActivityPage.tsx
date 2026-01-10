import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { mapActivityRow, type ActivityItem, type ActivityRow } from "@/lib/activity";

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

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <TabsList
              className={cn(
                "inline-flex h-10 items-center rounded-[var(--radius-inner)] p-1",
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
                value="matches"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
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
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
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
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
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
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                  "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                )}
              >
                Команда
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="secondary" className="h-10 px-4" onClick={() => navigate("/notifications")}>
            Сповіщення
          </Button>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Завантаження...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[var(--radius-inner)] border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              Поки немає дій.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.href && navigate(item.href)}
                  className={cn(
                    "w-full text-left rounded-[var(--radius-inner)] border border-border bg-card/60 p-4 transition-colors hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{item.title}</div>
                      {item.subtitle ? (
                        <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.subtitle}</div>
                      ) : null}
                      {item.actor ? (
                        <div className="mt-2 text-xs text-muted-foreground">Зробив: {item.actor}</div>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
