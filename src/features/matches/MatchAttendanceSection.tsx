import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
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
    <Paper withBorder shadow="sm" p="md" radius="md">
      <Group justify="space-between" align="center" mb="sm">
        <Title order={4}>Склад на матч</Title>
        <Group gap="xs">
          <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={saving || loading}>
            Відмітити всіх
          </Button>
          <Button variant="subtle" size="sm" onClick={handleClearAll} disabled={saving || loading}>
            Очистити всіх
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" mb="sm" title="Помилка">
          {error}
        </Alert>
      )}

      <ScrollArea h={320} type="auto">
        {loading ? (
          <Text size="sm" c="dimmed">
            Завантаження...
          </Text>
        ) : playerList.length === 0 ? (
          <Text size="sm">Немає активних гравців.</Text>
        ) : (
          <Stack gap={4}>
            {playerList.map((p) => {
              const label =
                p.shirt_number !== null
                  ? `${p.shirt_number}. ${p.last_name} ${p.first_name}`
                  : `${p.last_name} ${p.first_name}`;
              const checked = attendance.has(p.id);
              return (
                <Box
                  key={p.id}
                  px="xs"
                  py={6}
                  style={{ borderBottom: '1px solid hsl(var(--border) / 0.6)' }}
                >
                  <Group gap="sm">
                    <Checkbox
                      checked={checked}
                      disabled={saving}
                      onChange={(e) => togglePlayer(p.id, e.currentTarget.checked)}
                    />
                    <Text>{label}</Text>
                  </Group>
                </Box>
              );
            })}
          </Stack>
        )}
      </ScrollArea>

      {saving && (
        <Text size="xs" c="dimmed" mt="xs">
          Збереження змін...
        </Text>
      )}
    </Paper>
  );
}
