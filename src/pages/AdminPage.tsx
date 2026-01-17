import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { MatchAttendanceSection } from "../features/matches/MatchAttendanceSection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  TableActionCell,
  TableActionHeaderCell,
  TableHeaderCell,
  TableNumericCell,
} from "@/components/app/table-kit";

const TEAM_ID = '389719a7-5022-41da-bc49-11e7a3afbd98';

type MatchStatus = 'scheduled' | 'played' | 'canceled';
type HomeAway = 'home' | 'away' | 'neutral';

type Tournament = {
  id: string;
  club_id: string | null;
  name: string;
  short_name: string | null;
  season: string;
  league_name: string | null;
  age_group: string | null;
  external_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
};

type TeamTournament = {
  id: string;
  team_id: string;
  tournament_id: string;
  is_primary: boolean;
  created_at: string;
  tournament: Tournament;
};

type Match = {
  id: string;
  team_id: string;
  opponent_name: string;
  match_date: string;
  home_away: HomeAway;
  status: MatchStatus;
  score_team: number | null;
  score_opponent: number | null;
  tournament_id: string | null;
  stage: string | null;
  matchday: number | null;
};

type FormState = {
  opponentName: string;
  dateTime: string;
  homeAway: HomeAway;
  status: MatchStatus;
  scoreOpponent: string;
  tournamentId: string;
  stage: string;
  matchday: string;
};

const statusLabels: Record<MatchStatus, string> = {
  scheduled: 'Запланований',
  played: 'Зіграний',
  canceled: 'Скасований',
};

export function AdminPage() {
  const [form, setForm] = useState<FormState>({
    opponentName: '',
    dateTime: '',
    homeAway: 'home',
    status: 'scheduled',
    scoreOpponent: '',
    tournamentId: '',
    stage: '',
    matchday: '',
  });

  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [teamTournaments, setTeamTournaments] = useState<TeamTournament[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function loadMatches() {
    setLoadingMatches(true);
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('team_id', TEAM_ID)
      .order('match_date', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setMatches((data || []) as Match[]);
    }
    setLoadingMatches(false);
  }

  async function loadTeamTournaments() {
    const { data, error } = await supabase
      .from('team_tournaments')
      .select('id, team_id, tournament_id, is_primary, created_at, tournaments(*)')
      .eq('team_id', TEAM_ID);

    if (error) {
      console.error('Помилка завантаження турнірів', error);
      return;
    }

    const rows = (data || []) as any[];
    const mapped: TeamTournament[] = rows
      .filter((row) => row.tournaments)
      .map((row) => ({
        id: row.id,
        team_id: row.team_id,
        tournament_id: row.tournament_id,
        is_primary: row.is_primary,
        created_at: row.created_at,
        tournament: row.tournaments as Tournament,
      }));

    mapped.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      if (a.tournament.season !== b.tournament.season) {
        return b.tournament.season.localeCompare(a.tournament.season);
      }
      return a.tournament.name.localeCompare(b.tournament.name);
    });

    setTeamTournaments(mapped);
  }

  useEffect(() => {
    loadMatches();
    loadTeamTournaments();
  }, []);

  function resetForm() {
    setForm({
      opponentName: '',
      dateTime: '',
      homeAway: 'home',
      status: 'scheduled',
      scoreOpponent: '',
      tournamentId: '',
      stage: '',
      matchday: '',
    });
    setMode('create');
    setEditingId(null);
  }

  function fillFormFromMatch(match: Match) {
    const date = new Date(match.match_date);
    const isoLocal = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);

    setForm({
      opponentName: match.opponent_name,
      dateTime: isoLocal,
      homeAway: match.home_away,
      status: match.status,
      scoreOpponent:
        match.score_opponent !== null ? String(match.score_opponent) : '',
      tournamentId: match.tournament_id || '',
      stage: match.stage || '',
      matchday: match.matchday !== null ? String(match.matchday) : '',
    });
    setMode('edit');
    setEditingId(match.id);
    setSuccess(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.opponentName.trim()) {
      setError('Потрібно вказати назву суперника');
      return;
    }

    if (!form.dateTime) {
      setError('Потрібно вказати дату та час');
      return;
    }

    const matchDate = new Date(form.dateTime);
    if (isNaN(matchDate.getTime())) {
      setError('Некоректна дата');
      return;
    }

    const scoreOpponent =
      form.scoreOpponent.trim() === '' ? null : Number(form.scoreOpponent);

    if (form.status === 'played' && scoreOpponent === null) {
      setError('Для зіграного матчу потрібно ввести рахунок суперника');
      return;
    }

    const tournamentIdToSave = form.tournamentId || null;
    const stageToSave = form.stage.trim() || null;
    const matchdayNumber =
      form.matchday.trim() === '' ? null : Number(form.matchday.trim());
    if (matchdayNumber !== null && Number.isNaN(matchdayNumber)) {
      setError('Тур має бути числом');
      return;
    }

    setSaving(true);

    if (mode === 'create') {
      const { error } = await supabase.from('matches').insert({
        team_id: TEAM_ID,
        opponent_name: form.opponentName.trim(),
        match_date: matchDate.toISOString(),
        home_away: form.homeAway,
        status: form.status,
        score_team: 0,
        score_opponent: scoreOpponent,
        tournament_id: tournamentIdToSave,
        stage: stageToSave,
        matchday: matchdayNumber,
      });

      setSaving(false);

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess('Матч створено');
      resetForm();
      loadMatches();
    } else if (mode === 'edit' && editingId) {
      const { error } = await supabase
        .from('matches')
        .update({
          opponent_name: form.opponentName.trim(),
          match_date: matchDate.toISOString(),
          home_away: form.homeAway,
          status: form.status,
          score_opponent: scoreOpponent,
          tournament_id: tournamentIdToSave,
          stage: stageToSave,
          matchday: matchdayNumber,
        })
        .eq('id', editingId);

      setSaving(false);

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess('Матч оновлено');
      resetForm();
      loadMatches();
    } else {
      setSaving(false);
      setError('Невідомий режим');
    }
  }

  async function handleDelete(id: string) {
    const confirmDelete = window.confirm('Видалити цей матч?');
    if (!confirmDelete) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.from('matches').delete().eq('id', id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (mode === 'edit' && editingId === id) {
      resetForm();
    }

    setSuccess('Матч видалено');
    loadMatches();
  }

  const tournamentOptions = teamTournaments;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">
        {mode === "create" ? "Адмінка – створення матчу" : "Адмінка – редагування матчу"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Створи матч, привʼяжи турнір та додай склад на гру.
        </p>
      </div>

      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Помилка</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <AlertTitle>Готово</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Card className="border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Дані матчу</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Суперник</Label>
                  <Input
                    className="h-10"
                    placeholder="Наприклад, AFK Kateter"
                    value={form.opponentName}
                    onChange={(e) => updateForm("opponentName", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Дата та час</Label>
                  <Input
                    type="datetime-local"
                    className="h-10"
                    value={form.dateTime}
                    onChange={(e) => updateForm("dateTime", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Поле</Label>
                  <Select
                    value={form.homeAway}
                    onValueChange={(value) => updateForm("homeAway", value as HomeAway)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть поле" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Вдома</SelectItem>
                      <SelectItem value="away">Виїзд</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Статус</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) => updateForm("status", value as MatchStatus)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Запланований</SelectItem>
                      <SelectItem value="played">Зіграний</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Турнір</Label>
                <Select
                  value={form.tournamentId || "none"}
                  onValueChange={(value) => updateForm("tournamentId", value === "none" ? "" : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Оберіть турнір" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без турніру</SelectItem>
                    {tournamentOptions.map((tt) => (
                      <SelectItem key={tt.tournament_id} value={tt.tournament_id}>
                        {`${tt.tournament.name} (${tt.tournament.season})${tt.is_primary ? " • основний" : ""}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Стадія</Label>
                  <Input
                    className="h-10"
                    placeholder="Регулярний чемпіонат"
                    value={form.stage}
                    onChange={(e) => updateForm("stage", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Тур</Label>
                  <Input
                    type="number"
                    className="h-10"
                    min={0}
                    placeholder="1"
                    value={form.matchday}
                    onChange={(e) => updateForm("matchday", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Рахунок суперника</Label>
                  <Input
                    type="number"
                    className="h-10"
                    min={0}
                    value={form.scoreOpponent}
                    onChange={(e) => updateForm("scoreOpponent", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Наш рахунок (авто)</Label>
                  <Input
                    className="h-10"
                    readOnly
                    value={
                      mode === "edit"
                        ? String(matches.find((m) => m.id === editingId)?.score_team ?? "—")
                        : "—"
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving
                    ? mode === "create"
                      ? "Збереження…"
                      : "Оновлення…"
                    : mode === "create"
                      ? "Створити матч"
                      : "Зберегти зміни"}
                </Button>
                {mode === "edit" && (
                  <Button size="sm" variant="outline" onClick={resetForm} disabled={saving}>
                    Скасувати редагування
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {mode === "edit" && editingId && <MatchAttendanceSection matchId={editingId} />}

        <Card className="border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Список матчів</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMatches ? (
              <p className="text-sm text-muted-foreground">Завантаження матчів…</p>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ще немає матчів.</p>
            ) : (
              <Table variant="list" size="md">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Дата</TableHeaderCell>
                    <TableHeaderCell>Суперник</TableHeaderCell>
                    <TableHeaderCell>Статус</TableHeaderCell>
                    <TableHeaderCell align="center">Рахунок</TableHeaderCell>
                    <TableActionHeaderCell>Дії</TableActionHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => {
                    const date = new Date(m.match_date);
                    const score =
                      m.score_team !== null && m.score_opponent !== null
                        ? `${m.score_team} : ${m.score_opponent}`
                        : "— : —";

                    const statusLabel = statusLabels[m.status];

                    return (
                      <TableRow key={m.id}>
                        <TableCell>{date.toLocaleString()}</TableCell>
                        <TableCell>{m.opponent_name}</TableCell>
                        <TableCell>{statusLabel}</TableCell>
                        <TableNumericCell align="center">{score}</TableNumericCell>
                        <TableActionCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="xs" variant="secondary" onClick={() => fillFormFromMatch(m)}>
                              Редагувати
                            </Button>
                            <Button size="xs" variant="destructive" onClick={() => handleDelete(m.id)}>
                              Видалити
                            </Button>
                            <Button asChild size="xs" variant="outline">
                              <Link to={`/admin/matches/${m.id}/events`}>Події</Link>
                            </Button>
                          </div>
                        </TableActionCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
