import {
  IconBallFootball,
  IconSquareRounded,
  IconSquareRoundedFilled,
  IconTimelineEvent,
} from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function playerLabel(player: Player | undefined) {
  if (!player) return 'Н/Д';
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
    <div className="space-y-6">
      <Card className="border border-border shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ключові моменти</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Голи</p>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Голи відсутні</p>
            ) : (
              <div className="space-y-2">
                {goals.map((g) => {
                  const player = players.find((p) => p.id === g.player_id);
                  return (
                    <div key={g.id} className="flex items-center gap-2 text-sm">
                      <span>⚽</span>
                      <span>
                        {playerLabel(player)} {g.minute ? `(${g.minute}’)` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Картки</p>
            {yellowCards.length === 0 && redCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Карток немає</p>
            ) : (
              <div className="space-y-2">
                {yellowCards.map((c) => {
                  const player = players.find((p) => p.id === c.player_id);
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span>🟨</span>
                      <span>
                        {playerLabel(player)} {c.minute ? `(${c.minute}’)` : ""}
                      </span>
                    </div>
                  );
                })}
                {redCards.map((c) => {
                  const player = players.find((p) => p.id === c.player_id);
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span>🟥</span>
                      <span>
                        {playerLabel(player)} {c.minute ? `(${c.minute}’)` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-none">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <IconTimelineEvent size={18} className="text-muted-foreground" />
          <CardTitle className="text-base">Таймлайн</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Подій із зазначенням хвилини немає.</p>
          ) : (
            <>
              <div className="relative h-20 w-full">
                <div className="absolute left-0 right-0 top-[40%] h-3 rounded bg-primary/80" />
                <div className="absolute left-0 right-0 top-[60%] flex items-center justify-between px-2 text-xs font-semibold text-primary-foreground">
                  <span>{Math.round(half)}’</span>
                  <span>{duration}’</span>
                </div>
                {markerEvents.map((e) => {
                  const pos = ((e.minute ?? 0) / duration) * 100;
                  const iconColor =
                    e.event_type === "red_card"
                      ? "hsl(var(--danger-foreground))"
                      : e.event_type === "yellow_card"
                        ? "hsl(var(--warning-foreground))"
                        : "hsl(var(--success-foreground))";
                  return (
                    <div
                      key={e.id}
                      className="absolute top-0"
                      style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {e.event_type === "yellow_card" ? (
                          <IconSquareRounded size={18} color={iconColor} />
                        ) : e.event_type === "red_card" ? (
                          <IconSquareRoundedFilled size={18} color={iconColor} />
                        ) : (
                          <IconBallFootball size={18} color={iconColor} />
                        )}
                        <div className="h-6 w-0.5 bg-primary/50" />
                        <span className="text-xs font-semibold text-muted-foreground">{e.minute}’</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="h-3" />

              <div className="space-y-3">
                {timelineItems.map((e) => {
                  const player = players.find((p) => p.id === e.player_id);
                  const assist = players.find((p) => p.id === e.assist_player_id);
                  return (
                    <div key={e.id} className="flex items-stretch gap-4">
                      <div className="flex-1">
                        {e.side === "left" && (
                          <div className="space-y-1 text-right">
                            <div className="text-sm font-semibold">{playerLabel(player)}</div>
                            {assist && (
                              <div className="text-xs text-muted-foreground">
                                Асист: {playerLabel(assist)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="relative flex w-20 items-center justify-center">
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-lg font-semibold text-success-foreground">{e.minute}’</span>
                          <span className="h-3 w-3 rounded-full" style={{ background: e.color }} />
                        </div>
                      </div>

                      <div className="flex-1">
                        {e.side === "right" && (
                          <div className="space-y-1 text-left">
                            <div className="text-sm font-semibold">{playerLabel(player)}</div>
                            {assist && (
                              <div className="text-xs text-muted-foreground">
                                Асист: {playerLabel(assist)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="w-16" />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
