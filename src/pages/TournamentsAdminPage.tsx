// src/pages/TournamentsAdminPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSkeleton } from "@/components/app/page-skeleton-templates";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { usePageData } from "@/hooks/usePageData";

import { ArrowRight, CalendarDays, Flag, Star, Trophy } from "lucide-react";

/* ================= TYPES ================= */

type Tournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  league_name: string | null;
  age_group: string | null;
  external_url: string | null;
  logo_url: string | null;
};

type TeamTournamentRow = {
  is_primary: boolean;
  // важливо: може бути null, якщо FK битий/нема запису
  tournament: Tournament | null;
};

type TournamentFormState = {
  name: string;
  short_name: string;
  season: string;
  league_name: string;
  age_group: string;
  external_url: string;
  logo_url: string;
  is_primary: boolean;
};

/* ================= CONFIG ================= */

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const EMPTY_FORM: TournamentFormState = {
  name: "",
  short_name: "",
  season: "",
  league_name: "",
  age_group: "",
  external_url: "",
  logo_url: "",
  is_primary: false,
};

function normalizeNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/* ================= PAGE ================= */

export function TournamentsAdminPage() {
  const [items, setItems] = useState<TeamTournamentRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TournamentFormState>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTeamTournaments = useCallback(async () => {
    return supabase
      .from("team_tournaments")
      .select(
        `
          is_primary,
          tournament:tournament_id (
            id,
            name,
            short_name,
            season,
            league_name,
            age_group,
            external_url,
            logo_url
          )
        `
      )
      .eq("team_id", TEAM_ID)
      .order("is_primary", { ascending: false });
  }, []);

  const { data, showSkeleton, refetch } = usePageData<{ items: TeamTournamentRow[] }>({
    cacheKey: "tournaments-admin",
    loadFn: async () => {
      const { data, error } = await fetchTeamTournaments();
      if (error) {
        console.error("Tournaments load error", error);
        return { items: [] };
      }

      const nextItems = ((data ?? []) as unknown as TeamTournamentRow[]).filter((x) => !!x.tournament);
      return { items: nextItems };
    },
  });

  useEffect(() => {
    if (!data) return;
    setItems(data.items);
  }, [data]);

  const stats = useMemo(() => {
    const total = items.length;
    const primary = items.filter((i) => i.is_primary).length;
    const seasons = new Set(items.map((i) => i.tournament?.season).filter(Boolean) as string[]).size;
    const leagues = new Set(items.map((i) => i.tournament?.league_name).filter(Boolean) as string[]).size;
    return { total, primary, seasons, leagues };
  }, [items]);

  const kpis = useMemo(
    () => [
      {
        key: "total",
        label: "Всього турнірів",
        value: String(stats.total),
        icon: Trophy,
        iconTone: "bg-blue-500/10 text-blue-600",
      },
      {
        key: "primary",
        label: "Основні",
        value: String(stats.primary),
        icon: Star,
        iconTone: "bg-amber-500/10 text-amber-600",
      },
      {
        key: "seasons",
        label: "Сезони",
        value: String(stats.seasons),
        icon: CalendarDays,
        iconTone: "bg-emerald-500/10 text-emerald-600",
      },
      {
        key: "leagues",
        label: "Ліги",
        value: String(stats.leagues),
        icon: Flag,
        iconTone: "bg-indigo-500/10 text-indigo-600",
      },
    ],
    [stats]
  );

  const handleCreateTournament = useCallback(async () => {
    if (!createForm.name.trim()) {
      setCreateError("Вкажи назву турніру.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);

    const { data: tournamentRow, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        name: createForm.name.trim(),
        short_name: normalizeNullable(createForm.short_name),
        season: normalizeNullable(createForm.season),
        league_name: normalizeNullable(createForm.league_name),
        age_group: normalizeNullable(createForm.age_group),
        external_url: normalizeNullable(createForm.external_url),
        logo_url: normalizeNullable(createForm.logo_url),
      })
      .select("id")
      .single();

    if (tournamentError || !tournamentRow) {
      setCreateError(tournamentError?.message || "Не вдалося створити турнір.");
      setCreateSaving(false);
      return;
    }

    const { error: linkError } = await supabase.from("team_tournaments").insert({
      team_id: TEAM_ID,
      tournament_id: tournamentRow.id,
      is_primary: createForm.is_primary,
    });

    if (linkError) {
      setCreateError(linkError.message || "Не вдалося привʼязати турнір до команди.");
      setCreateSaving(false);
      return;
    }

    if (createForm.is_primary) {
      const { error: resetError } = await supabase
        .from("team_tournaments")
        .update({ is_primary: false })
        .eq("team_id", TEAM_ID)
        .neq("tournament_id", tournamentRow.id);

      if (resetError) {
        setCreateError(resetError.message || "Не вдалося оновити основний турнір.");
        setCreateSaving(false);
        return;
      }
    }

    await refetch();

    setCreateSaving(false);
    setCreateForm(EMPTY_FORM);
    setCreateOpen(false);
  }, [createForm, refetch]);

  const content = useMemo(() => {
    if (!items.length) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Поки немає доданих турнірів
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2">
        {items.map(({ is_primary, tournament }) => {
          if (!tournament) return null;

          return (
            <Card
              key={tournament.id}
              className={cn(
                "group rounded-[var(--radius-inner)] border border-border bg-card transition-all",
                "hover:-translate-y-[1px] hover:shadow-[var(--shadow-floating)]"
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* LOGO */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-border">
                  {tournament.logo_url ? (
                    <img
                      src={tournament.logo_url}
                      alt={tournament.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* INFO */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-semibold text-foreground">{tournament.name}</div>
                    {is_primary && <Badge variant="secondary">Основний</Badge>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {tournament.season ? (
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                        {tournament.season}
                      </Badge>
                    ) : null}
                    {tournament.league_name ? (
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                        {tournament.league_name}
                      </Badge>
                    ) : null}
                    {tournament.age_group ? (
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                        {tournament.age_group}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* ACTION */}
                <Button asChild size="sm" variant="ghost">
                  <Link to={`/admin/tournaments/${tournament.id}`}>
                    <span className="flex items-center gap-1">
                      Перейти <ArrowRight className="h-4 w-4" />
                    </span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }, [items]);

  const headerActions = useMemo(
    () => (
      <Button onClick={() => setCreateOpen(true)} variant="primary">
        Додати турнір
      </Button>
    ),
    [setCreateOpen]
  );

  usePageHeaderActions(headerActions, [setCreateOpen]);

  return showSkeleton ? (
    <DashboardSkeleton />
  ) : (
    <div className="space-y-6">
      <OperationalSummary
        title="Огляд турнірів"
        subtitle="Змагання, в яких бере участь команда"
        titleVariant="hidden"
        sectionLabel="Огляд турнірів"
        sectionIcon={Trophy}
        hideNextUp
        kpis={kpis}
      />

      <Card className="rounded-[var(--radius-section)] border border-border bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Усі турніри</CardTitle>
            <p className="text-sm text-muted-foreground">Перегляд деталей і статусу</p>
          </div>
          <Badge variant="secondary">{items.length}</Badge>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateForm(EMPTY_FORM);
            setCreateError(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-xl border-border bg-card/95 p-0 sm:max-w-xl">
          <div className="flex h-full flex-col">
            <div className="border-b border-border bg-card/70 px-6 py-4">
              <SheetHeader>
                <SheetTitle>Новий турнір</SheetTitle>
                <SheetDescription>
                  Заповни базову інформацію, щоб додати турнір до команди.
                </SheetDescription>
              </SheetHeader>
              {createError ? (
                <div className="mt-4 rounded-[var(--radius-inner)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {createError}
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Назва турніру *</Label>
                  <Input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Наприклад: V9KY Cup"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Коротка назва</Label>
                  <Input
                    value={createForm.short_name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, short_name: event.target.value }))}
                    placeholder="V9KY"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Сезон</Label>
                  <Input
                    value={createForm.season}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, season: event.target.value }))}
                    placeholder="2025/26"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Ліга</Label>
                  <Input
                    value={createForm.league_name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, league_name: event.target.value }))}
                    placeholder="Gold League"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Вікова група</Label>
                  <Input
                    value={createForm.age_group}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, age_group: event.target.value }))}
                    placeholder="U-19"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Посилання на турнір</Label>
                  <Input
                    value={createForm.external_url}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, external_url: event.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Лого (URL)</Label>
                  <Input
                    value={createForm.logo_url}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, logo_url: event.target.value }))}
                    placeholder="https://.../logo.png"
                  />
                </div>
                <div className="flex items-center gap-3">
                <Checkbox
                  checked={createForm.is_primary}
                  onCheckedChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, is_primary: Boolean(value) }))
                  }
                />
                  <span className="text-sm text-foreground">Зробити основним турніром</span>
                </div>
              </div>
            </div>

            <SheetFooter className="border-t border-border bg-card/70 px-6 py-4">
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createSaving}>
                Скасувати
              </Button>
              <Button onClick={handleCreateTournament} disabled={createSaving}>
                {createSaving ? "Збереження..." : "Створити"}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
