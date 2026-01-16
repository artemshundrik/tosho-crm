import { Box, Center, Group, Paper, SimpleGrid, Space, Stack, Text, Title } from '@mantine/core';
import {
  IconBallFootball,
  IconSquareRounded,
  IconSquareRoundedFilled,
  IconTimelineEvent,
} from '@tabler/icons-react';

type MatchStatus = 'scheduled' | 'played' | 'canceled';

type Tournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  logo_url: string | null;
};

type Match = {
  id: string;
  opponent_name: string;
  match_date: string;
  status: MatchStatus;
  score_team: number | null;
  score_opponent: number | null;
  team_id: string;
  tournament_id: string | null;
  stage: string | null;
  matchday: number | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
};

type MatchEvent = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  assist_player_id: string | null;
  event_type: string;
  minute: number | null;
  created_at: string;
};

const statusLabels: Record<MatchStatus, { label: string; color: string }> = {
  scheduled: { label: 'Запланований', color: 'blue' },
  played: { label: 'Зіграний', color: 'teal' },
  canceled: { label: 'Скасований', color: 'red' },
};

const goalTypes = ['goal', 'own_goal', 'penalty_scored'];
const eventLabels: Record<string, string> = {
  goal: 'Гол',
  own_goal: 'Автогол',
  penalty_scored: 'Пенальті (забито)',
  penalty_missed: 'Пенальті (не забито)',
  yellow_card: 'Жовта картка',
  red_card: 'Червона картка',
  two_minutes: '2 хвилини',
  goalkeeper_save: 'Сейв воротаря',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function playerLabel(player: Player | undefined) {
  if (!player) return '—';
  return `${player.shirt_number ? `#${player.shirt_number} ` : ''}${player.last_name} ${player.first_name}`;
}

export function MatchOverviewTab({
  match,
  tournament,
  events,
  players,
}: {
  match: Match;
  tournament: Tournament | null;
  events: MatchEvent[];
  players: Player[];
}) {
  const goals = events.filter((e) => goalTypes.includes(e.event_type));
  const yellowCards = events.filter((e) => e.event_type === 'yellow_card');
  const redCards = events.filter((e) => e.event_type === 'red_card');

  const timeline = events
    .filter((e) => e.minute !== null)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  const timelineItems = timeline.map((e) => {
    const isHome = e.team_id === match.team_id;
    return {
      ...e,
      side: isHome ? 'left' : 'right',
      label: eventLabels[e.event_type] || e.event_type,
      color:
        e.event_type === 'red_card'
          ? 'hsl(var(--danger-foreground))'
          : e.event_type === 'yellow_card'
            ? 'hsl(var(--warning-foreground))'
            : 'hsl(var(--success-foreground))',
    };
  });

  const duration = Math.max(40, Math.max(...events.map((e) => e.minute || 0), 0));
  const half = duration / 2;
  const markerEvents = timeline.filter((e) => e.minute !== null);

  return (
    <Stack gap="xl">

      {/* Ключові моменти */}
      <Paper shadow="xs" radius="md" p="md">
        <Stack gap="md">
          <Text fw={700} size="lg">
            Ключові моменти
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <Stack gap={6}>
              <Text fw={600}>Голи</Text>
              {goals.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Голи відсутні
                </Text>
              ) : (
                goals.map((g) => {
                  const player = players.find((p) => p.id === g.player_id);
                  return (
                    <Group key={g.id} gap="xs">
                      <Text>⚽</Text>
                      <Text size="sm">
                        {playerLabel(player)} {g.minute ? `(${g.minute}’)` : ''}
                      </Text>
                    </Group>
                  );
                })
              )}
            </Stack>
            <Stack gap={6}>
              <Text fw={600}>Картки</Text>
              {yellowCards.length === 0 && redCards.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Карток немає
                </Text>
              ) : (
                <Stack gap={4}>
                  {yellowCards.map((c) => {
                    const player = players.find((p) => p.id === c.player_id);
                    return (
                      <Group key={c.id} gap="xs">
                        <Text>🟨</Text>
                        <Text size="sm">
                          {playerLabel(player)} {c.minute ? `(${c.minute}’)` : ''}
                        </Text>
                      </Group>
                    );
                  })}
                  {redCards.map((c) => {
                    const player = players.find((p) => p.id === c.player_id);
                    return (
                      <Group key={c.id} gap="xs">
                        <Text>🟥</Text>
                        <Text size="sm">
                          {playerLabel(player)} {c.minute ? `(${c.minute}’)` : ''}
                        </Text>
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </SimpleGrid>
        </Stack>
      </Paper>

      {/* Таймлайн */}
      <Paper shadow="xs" radius="md" p="md">
        <Stack gap="sm" align="stretch">
          <Group gap="xs">
            <IconTimelineEvent size={18} />
            <Text fw={700} size="lg">
              Таймлайн
            </Text>
          </Group>
          {timeline.length === 0 ? (
            <Text size="sm" c="dimmed">
              Подій із зазначенням хвилини немає.
            </Text>
          ) : (
            <>
              {/* верхня горизонтальна шкала */}
              <Box pos="relative" style={{ width: '100%', height: 80 }}>
                <Box
                  pos="absolute"
                  left={0}
                  right={0}
                  top="40%"
                  style={{ height: 12, background: 'hsl(var(--primary))', borderRadius: 4 }}
                />
                {/* лейбли таймів */}
                <Group justify="space-between" align="center" pos="absolute" top="60%" left={0} right={0} px="xs">
                  <Text size="xs" fw={600} style={{ color: 'hsl(var(--primary-foreground))' }}>
                    {Math.round(half)}’
                  </Text>
                  <Text size="xs" fw={600} style={{ color: 'hsl(var(--primary-foreground))' }}>
                    {duration}’
                  </Text>
                </Group>
                {markerEvents.map((e) => {
                  const pos = ((e.minute ?? 0) / duration) * 100;
                  const iconColor =
                    e.event_type === 'red_card'
                      ? 'hsl(var(--danger-foreground))'
                      : e.event_type === 'yellow_card'
                        ? 'hsl(var(--warning-foreground))'
                        : 'hsl(var(--success-foreground))';
                  return (
                    <Box key={e.id} pos="absolute" left={`${pos}%`} top={0} style={{ transform: 'translateX(-50%)' }}>
                      <Stack gap={4} align="center">
                        {e.event_type === 'yellow_card' ? (
                          <IconSquareRounded size={18} color={iconColor} />
                        ) : e.event_type === 'red_card' ? (
                          <IconSquareRoundedFilled size={18} color={iconColor} />
                        ) : (
                          <IconBallFootball size={18} color={iconColor} />
                        )}
                        <Box style={{ width: 2, height: 24, background: 'hsl(var(--primary) / 0.5)' }} />
                        <Text size="xs" fw={600} c="dimmed">
                          {e.minute}’
                        </Text>
                      </Stack>
                    </Box>
                    );
                  })}
                </Box>

              <Space h="sm" />

              {/* вертикальна вісь і події */}
              <Stack gap="sm" style={{ alignItems: 'stretch' }}>
                {timelineItems.map((e) => {
                  const player = players.find((p) => p.id === e.player_id);
                  const assist = players.find((p) => p.id === e.assist_player_id);
                  return (
                    <Group key={e.id} align="stretch" gap="md">
                      <Box style={{ flex: 1 }}>
                        {e.side === 'left' && (
                          <Stack gap={4} align="flex-end">
                            <Text fw={700}>{playerLabel(player)}</Text>
                            {assist && (
                              <Text size="xs" c="dimmed">
                                Асист: {playerLabel(assist)}
                              </Text>
                            )}
                          </Stack>
                        )}
                      </Box>

                      <Center style={{ width: 80, position: 'relative' }}>
                        <Box
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            bottom: 0,
                            borderLeft: '1px dashed hsl(var(--border))',
                            transform: 'translateX(-50%)',
                          }}
                        />
                        <Stack gap={4} align="center" justify="center">
                          <Text fw={700} size="lg" style={{ color: 'hsl(var(--success-foreground))' }}>
                            {e.minute}’
                          </Text>
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: e.color,
                              zIndex: 1,
                            }}
                          />
                        </Stack>
                      </Center>

                      <Box style={{ flex: 1 }}>
                        {e.side === 'right' && (
                          <Stack gap={4} align="flex-start">
                            <Text fw={700}>{playerLabel(player)}</Text>
                            {assist && (
                              <Text size="xs" c="dimmed">
                                Асист: {playerLabel(assist)}
                              </Text>
                            )}
                          </Stack>
                        )}
                      </Box>

                      <Box style={{ minWidth: 64 }} />
                    </Group>
                  );
                })}
              </Stack>
              <Space h="xs" />
            </>
          )}
        </Stack>
      </Paper>

    </Stack>
  );
}
