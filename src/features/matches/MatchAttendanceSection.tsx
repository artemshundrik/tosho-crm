import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from '../../lib/supabaseClient';

type MatchAttendanceSectionProps = {
  matchId: string;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
};

export function MatchAttendanceSection({ matchId }: MatchAttendanceSectionProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerList = useMemo(() => players, [players]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const [playersRes, attendanceRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, first_name, last_name, shirt_number')
          .eq('is_active', true)
          .order('shirt_number', { ascending: true })
          .order('last_name', { ascending: true }),
        supabase
          .from('match_attendance')
          .select('player_id')
          .eq('match_id', matchId),
      ]);

      if (playersRes.error) {
        console.error('Помилка завантаження гравців', playersRes.error);
        setError('Не вдалось завантажити присутність гравців.');
      } else {
        setPlayers((playersRes.data || []) as Player[]);
      }

      if (attendanceRes.error) {
        console.error('Помилка завантаження присутності', attendanceRes.error);
        setError('Не вдалось завантажити присутність гравців.');
      } else {
        const ids = new Set<string>();
        (attendanceRes.data || []).forEach((row: { player_id: string }) =>
          ids.add(row.player_id),
        );
        setAttendance(ids);
      }

      setLoading(false);
    }

    if (matchId) {
      load();
    }
  }, [matchId]);

  async function togglePlayer(playerId: string, nextChecked: boolean) {
    if (!matchId) return;
    setSaving(true);
    setError(null);

    if (nextChecked) {
      const { error: insertError } = await supabase
        .from('match_attendance')
        .insert({ match_id: matchId, player_id: playerId });

      if (insertError) {
        console.error('Помилка при збереженні присутності', insertError);
        setError('Помилка при збереженні присутності.');
      } else {
        setAttendance((prev) => new Set(prev).add(playerId));
      }
    } else {
      const { error: deleteError } = await supabase
        .from('match_attendance')
        .delete()
        .eq('match_id', matchId)
        .eq('player_id', playerId);

      if (deleteError) {
        console.error('Помилка при збереженні присутності', deleteError);
        setError('Помилка при збереженні присутності.');
      } else {
        setAttendance((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    }
    setSaving(false);
  }

  async function handleSelectAll() {
    if (!matchId) return;
    if (players.length === 0) return;
    setSaving(true);
    setError(null);

    // Скидаємо поточні записи і додаємо нові — менше конфліктів/проблем з onConflict.
    const { error: clearError } = await supabase
      .from('match_attendance')
      .delete()
      .eq('match_id', matchId);

    if (clearError) {
      console.error('Помилка при масовому оновленні присутності (очищення)', clearError);
      setError('Помилка при масовому оновленні присутності.');
      setSaving(false);
      return;
    }

    const payload = players.map((p) => ({ match_id: matchId, player_id: p.id }));
    const { error: insertError } = await supabase.from('match_attendance').insert(payload);

    if (insertError) {
      console.error('Помилка при масовому оновленні присутності (створення)', insertError);
      setError('Помилка при масовому оновленні присутності.');
      setSaving(false);
      return;
    }

    setAttendance(new Set(players.map((p) => p.id)));
    setSaving(false);
  }

  async function handleClearAll() {
    if (!matchId) return;
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('match_attendance')
      .delete()
      .eq('match_id', matchId);

    if (deleteError) {
      console.error('Помилка при очищенні присутності', deleteError);
      setError('Помилка при очищенні присутності.');
    } else {
      setAttendance(new Set());
    }
    setSaving(false);
  }

  return (
    <Card className="border border-border shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Склад на матч</CardTitle>
          <p className="text-xs text-muted-foreground">Відміть присутність гравців.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="xs" onClick={handleSelectAll} disabled={saving || loading}>
            Відмітити всіх
          </Button>
          <Button variant="ghost" size="xs" onClick={handleClearAll} disabled={saving || loading}>
            Очистити всіх
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Помилка</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-h-80 overflow-y-auto rounded-[var(--radius-inner)] border border-border/60 bg-muted/10">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Завантаження...</p>
          ) : playerList.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Немає активних гравців.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {playerList.map((p) => {
                const label =
                  p.shirt_number !== null
                    ? `${p.shirt_number}. ${p.last_name} ${p.first_name}`
                    : `${p.last_name} ${p.first_name}`;
                const checked = attendance.has(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => !saving && togglePlayer(p.id, !checked)}
                    onKeyDown={(e) => {
                      if (saving) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        togglePlayer(p.id, !checked);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={saving}
                      onCheckedChange={(next) => togglePlayer(p.id, Boolean(next))}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {saving && (
          <p className="text-xs text-muted-foreground">Збереження змін...</p>
        )}
      </CardContent>
    </Card>
  );
}
