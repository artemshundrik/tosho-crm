import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta } from "@/components/app/headers/toolbarPrimitives";
import { PageLoading } from "@/components/app/page-loading";
import { useMinimumLoading } from "@/hooks/useMinimumLoading";
import { usePageCache } from "@/hooks/usePageCache";
import { cn } from "@/lib/utils";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { AvatarBase } from "@/components/app/avatar-kit";
import { FEED_GROUP_LABEL, FEED_ROW } from "@/components/app/table-kit";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import {
  formatActivityClock,
  formatActivityDayLabel,
  mapActivityRow,
  type ActivityItem,
  type ActivityRow,
} from "@/lib/activity";
import { listTeamMembers } from "@/lib/toshoApi";
import { activityTitle, isNoiseActivity } from "@/components/team/activityCategories";
import { Activity, FileText, Palette, Users } from "@/components/icons/appIcons";

type FilterMode = "all" | "quotes" | "design" | "team" | "other";

const FILTER_TABS: { value: FilterMode; label: string }[] = [
  { value: "all", label: "Всі" },
  { value: "quotes", label: "Прорахунки" },
  { value: "design", label: "Дизайн" },
  { value: "team", label: "Команда" },
  { value: "other", label: "Інше" },
];
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
        .select(
          "id, team_id, user_id, actor_name, action, entity_type, entity_id, title, href, event_date:metadata->>event_date, event_time:metadata->>event_time, created_at"
        )
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
    // Службові рядки (показ промо тощо) — не дія людини; команда їх уже ховає.
    const meaningful = items.filter((i) => !isNoiseActivity(i.action ?? null, i.title));
    if (filter === "all") return meaningful;
    return meaningful.filter((i) => i.type === filter);
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
      <UnifiedPageToolbar
        topLeft={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">Активність команди</div>
              <div className="text-sm text-muted-foreground">Усі події та зміни в одному місці</div>
            </div>
          </div>
        }
        topRight={
          <Button variant="secondary" onClick={() => navigate("/notifications")}>
            Сповіщення
          </Button>
        }
        filters={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "max-w-full overflow-x-auto [scrollbar-width:none]")}>
            {FILTER_TABS.map((tab) => (
              <Button
                key={tab.value}
                type="button"
                variant="segmented"
                size="xs"
                aria-pressed={filter === tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(SEGMENTED_TRIGGER, "flex-none")}
              >
                {tab.label}
              </Button>
            ))}
          </SegmentedGroup>
        }
        meta={<ToolbarMeta count={filtered.length} countLabel="подій" />}
      />
    ),
    [filter, filtered.length, navigate]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  const showSkeleton = useMinimumLoading(loading);

  if (showSkeleton) {
    return <PageLoading />;
  }

  const iconForItem = (item: ActivityItem) => {
    if (item.type === "quotes") return FileText;
    if (item.type === "design") return Palette;
    if (item.type === "team") return Users;
    return Activity;
  };

  const categoryLabel = (item: ActivityItem) =>
    FILTER_TABS.find((tab) => tab.value === item.type && tab.value !== "all")?.label ?? "Інше";

  return (
    <div className="pb-8">
      {/* Стрічка рядками по 32 px (хвиля Б1): хто · що · коли. Доти кожна подія
          була карткою на 88 px, і на екран влазило вісім подій замість двадцяти. */}
      {/* Від краю до краю, як таблиці на інших сторінках — без картки довкола. */}
      <div>
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Поки немає дій.</div>
        ) : (
          grouped.map(([label, dayItems]) => (
            <section key={label}>
              <div className={FEED_GROUP_LABEL}>{label}</div>
              {dayItems.map((item) => {
                const Icon = iconForItem(item);
                const title = activityTitle(item.title);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => item.href && navigate(item.href)}
                    className={cn(FEED_ROW, "h-8")}
                    title={item.actor ? `${item.actor} — ${title}` : title}
                  >
                    <AvatarBase
                      src={item.avatar_url}
                      name={item.actor || item.title || "User"}
                      size={20}
                      className="shrink-0"
                    />
                    {item.actor ? (
                      <span className="max-w-[40%] shrink-0 truncate font-medium text-foreground sm:max-w-[180px]">
                        {item.actor}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{title}</span>
                    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <Icon className="h-3.5 w-3.5" />
                      {categoryLabel(item)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {formatActivityClock(item.created_at)}
                    </span>
                  </button>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
