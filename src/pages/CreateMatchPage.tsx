// src/pages/CreateMatchPage.tsx
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLogger";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { DetailSkeleton } from "@/components/app/page-skeleton-templates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  TableActionCell,
  TableHeaderCell,
  TableNumericCell,
} from "@/components/app/table-kit";

import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  Pencil,
  Trash2,
  X,
  Flag,
  Swords,
} from "lucide-react";


const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

type DbTournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  league_name: string | null;
};

type TeamTournamentRow = {
  tournament_id: string;
  is_primary: boolean | null;
  tournaments: DbTournament | DbTournament[] | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  photo_url: string | null;
  position: string | null; // UNIV / GK ...
};

// У твоїй таблиці match_attendance немає status — присутність = наявність рядка
type AttendanceRow = {
  match_id: string;
  player_id: string;
};

type Step = 1 | 2 | 3;

/** ===== Події матчу (inline на кроці 3) ===== */
type EventType =
  | "goal"
  | "own_goal"
  | "penalty_scored"
  | "penalty_missed"
  | "yellow_card"
  | "red_card"
  | "goalkeeper_save";

type MatchEvent = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  assist_player_id: string | null;
  event_type: EventType;
  minute: number | null;
  created_at: string | null;
};

type InlineEventFormState = {
  eventType: EventType;
  playerId: string;
  assistPlayerId: string;
  minute: string;
};

const eventTypeLabels: Record<EventType, string> = {
  goal: "Гол",
  own_goal: "Автогол",
  penalty_scored: "Пенальті реалізовано",
  penalty_missed: "Пенальті не реалізовано",
  yellow_card: "Жовта картка",
  red_card: "Червона картка",
  goalkeeper_save: "Сейв воротаря",
};

const eventTypes: EventType[] = [
  "goal",
  "own_goal",
  "penalty_scored",
  "penalty_missed",
  "yellow_card",
  "red_card",
  "goalkeeper_save",
];

function safeDateTimeUA(iso: string | null | undefined) {
  if (!iso) return "Не вказано";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(d);
    return `${date} • ${time}`;
  } catch {
    return "Не вказано";
  }
}

function toIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) return NaN;
  return Math.floor(n);
}

function sortEventsStable(a: MatchEvent, b: MatchEvent) {
  const am = a.minute;
  const bm = b.minute;

  const aHas = typeof am === "number";
  const bHas = typeof bm === "number";

  if (aHas && bHas) {
    if (am! !== bm!) return am! - bm!;
  } else if (aHas && !bHas) {
    return -1;
  } else if (!aHas && bHas) {
    return 1;
  }

  const ac = a.created_at ? new Date(a.created_at).getTime() : Number.POSITIVE_INFINITY;
  const bc = b.created_at ? new Date(b.created_at).getTime() : Number.POSITIVE_INFINITY;

  if (ac !== bc) return ac - bc;
  return a.id.localeCompare(b.id);
}

function eventPillClasses(type: EventType) {
  switch (type) {
    case "goal":
    case "penalty_scored":
      return "bg-primary/10 border-primary/20";
    case "own_goal":
    case "penalty_missed":
      return "bg-destructive/10 border-destructive/20";
    case "yellow_card":
      return "bg-yellow-500/15 border-yellow-500/25";
    case "red_card":
      return "bg-red-500/15 border-red-500/25";
    default:
      return "bg-muted/40 border-border";
  }
}

function eventIcon(type: EventType) {
  if (type === "goal" || type === "penalty_scored") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none" aria-label="Гол" title="Гол">
        ⚽
      </span>
    );
  }
  if (type === "yellow_card") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Жовта картка"
        title="Жовта картка"
      >
        🟨
      </span>
    );
  }
  if (type === "red_card") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Червона картка"
        title="Червона картка"
      >
        🟥
      </span>
    );
  }
  if (type === "own_goal" || type === "penalty_missed") {
    return (
      <span
        className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none"
        aria-label="Автогол/Нереалізовано"
        title="Автогол/Нереалізовано"
      >
        ⚽
      </span>
    );
  }
  return <Flag className="h-4 w-4 text-muted-foreground" />;
}

/** ===== Загальні хелпери CreateMatchPage ===== */
function tournamentLabel(t: DbTournament) {
  const league = (t.league_name || "").trim();
  const short = (t.short_name || "").trim();
  const name = (t.name || "").trim();
  const season = (t.season || "").trim();

  const title = league || short || name || "Турнір";
  return season ? `${title} • ${season}` : title;
}

function isValidHttpUrlMaybeEmpty(value: string) {
  const v = value.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseNonNegativeInt(value: string) {
  const v = value.trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 0) return null;
  return n;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatHuman(d: Date) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function normalizeText(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[,\u00A0]/g, " ")
    .replace(/\s+/g, " ");
}

function parseTimeToken(token: string): { h: number; m: number } | null {
  const t = token.trim();

  const m1 = t.match(/^(\d{1,2})[:.\-](\d{1,2})$/);
  if (m1) {
    const h = Number(m1[1]);
    const m = Number(m1[2]);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;
    return { h, m };
  }

  const m2 = t.match(/^(\d{3,4})$/);
  if (m2) {
    const raw = m2[1];
    const h = Number(raw.slice(0, raw.length - 2));
    const m = Number(raw.slice(-2));
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    if (h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;
    return { h, m };
  }

  return null;
}

const MONTHS: Record<string, number> = {
  "січ": 1,
  "січня": 1,
  "лют": 2,
  "лютого": 2,
  "бер": 3,
  "березня": 3,
  "кві": 4,
  "квітня": 4,
  "тра": 5,
  "травня": 5,
  "чер": 6,
  "червня": 6,
  "лип": 7,
  "липня": 7,
  "сер": 8,
  "серпня": 8,
  "вер": 9,
  "вересня": 9,
  "жов": 10,
  "жовтня": 10,
  "лис": 11,
  "листопада": 11,
  "гру": 12,
  "грудня": 12,
  // рус
  "янв": 1,
  "января": 1,
  "фев": 2,
  "февраля": 2,
  "мар": 3,
  "марта": 3,
  "апр": 4,
  "апреля": 4,
  "май": 5,
  "мая": 5,
  "июн": 6,
  "июня": 6,
  "июл": 7,
  "июля": 7,
  "авг": 8,
  "августа": 8,
  "сен": 9,
  "сент": 9,
  "сентября": 9,
  "окт": 10,
  "октября": 10,
  "ноя": 11,
  "ноября": 11,
  "дек": 12,
  "декабря": 12,
};

const WEEKDAYS: Record<string, number> = {
  // JS: 0=Sun,1=Mon,...6=Sat
  "пн": 1,
  "пон": 1,
  "понеділок": 1,
  "понеділка": 1,
  "вт": 2,
  "вів": 2,
  "вівторок": 2,
  "вівторка": 2,
  "ср": 3,
  "сер": 3,
  "середа": 3,
  "середи": 3,
  "чт": 4,
  "чет": 4,
  "четвер": 4,
  "четверга": 4,
  "пт": 5,
  "пят": 5,
  "пʼятниця": 5,
  "п'ятниця": 5,
  "пятница": 5,
  "сб": 6,
  "суб": 6,
  "субота": 6,
  "суббота": 6,
  "нд": 0,
  "нед": 0,
  "неділя": 0,
  "вс": 0,
  "воск": 0,
  "воскресенье": 0,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function nextWeekdayDate(targetDow: number, now = new Date()) {
  const today = startOfDay(now);
  const current = today.getDay(); // 0..6
  const delta = (targetDow - current + 7) % 7;
  const res = new Date(today);
  res.setDate(res.getDate() + delta);
  return res;
}

function parseSmartDateTime(input: string, now = new Date()): { date: Date; confidence: "high" | "medium" } | null {
  const raw = normalizeText(input);
  if (!raw) return null;

  const tokens = raw.split(" ");

  let time: { h: number; m: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = parseTimeToken(tokens[i]);
    if (t) {
      time = t;
      break;
    }
    if (i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i]) && /^\d{1,2}$/.test(tokens[i + 1])) {
      const h = Number(tokens[i]);
      const m = Number(tokens[i + 1]);
      if (Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        time = { h, m };
        break;
      }
    }
  }
  if (!time) return null;

  // weekday + time: "сб 14:50"
  {
    const wdToken = tokens[0];
    const key = wdToken ? wdToken.replace(".", "") : "";
    const dow = WEEKDAYS[key] ?? WEEKDAYS[key.slice(0, 3)];
    if (typeof dow === "number") {
      const base = nextWeekdayDate(dow, now);
      base.setHours(time.h, time.m, 0, 0);
      if (!Number.isNaN(base.getTime())) return { date: base, confidence: "medium" };
    }
  }

  // relative: today/yesterday/tomorrow
  if (
    raw.startsWith("сьогодні") ||
    raw.startsWith("сегодня") ||
    raw.startsWith("вчора") ||
    raw.startsWith("вчера") ||
    raw.startsWith("завтра")
  ) {
    const base = new Date(now);
    if (raw.startsWith("вчора") || raw.startsWith("вчера")) base.setDate(base.getDate() - 1);
    if (raw.startsWith("завтра")) base.setDate(base.getDate() + 1);
    base.setHours(time.h, time.m, 0, 0);
    if (!Number.isNaN(base.getTime())) return { date: base, confidence: "medium" };
  }

  // DD.MM[.YYYY]
  const dmy = raw.match(/(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2,4}))?/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (dmy[3] && dmy[3].length === 2) year = 2000 + year;

    if (Number.isInteger(day) && Number.isInteger(month) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day, time.h, time.m, 0, 0);
      if (!Number.isNaN(d.getTime())) return { date: d, confidence: dmy[3] ? "high" : "medium" };
    }
  }

  // "27 вер 14:40" (+ optional year)
  for (let i = 0; i < tokens.length; i++) {
    const dayNum = Number(tokens[i]);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;

    const monthToken = tokens[i + 1];
    if (!monthToken) continue;

    const mt = monthToken.replace(".", "");
    const month = MONTHS[mt] ?? MONTHS[mt.slice(0, 3)];
    if (!month) continue;

    let year = now.getFullYear();
    const yearToken = tokens[i + 2];
    if (yearToken && /^\d{2,4}$/.test(yearToken)) {
      let y = Number(yearToken);
      if (yearToken.length === 2) y = 2000 + y;
      if (y >= 2000 && y <= 2100) year = y;
    }

    const d = new Date(year, month - 1, dayNum, time.h, time.m, 0, 0);
    if (!Number.isNaN(d.getTime())) return { date: d, confidence: yearToken ? "high" : "medium" };
  }

  return null;
}

function formatPosition(pos: string | null | undefined) {
  const p = (pos || "").trim().toUpperCase();
  if (!p) return "Не вказано";
  if (p === "GK") return "Воротар";
  if (p === "UNIV") return "Універсал";
  return p;
}

function fullName(p: Player) {
  return `${p.last_name} ${p.first_name}`.trim();
}

/** Стабільний switch (без Radix), працює 1:1 */
/** Пілл-тогл як на скріні (Присутній / Відсутній) */
function AttendancePillToggle({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant="pill"
      size="sm"
      role="switch"
      aria-checked={checked}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(disabled && "opacity-70 cursor-not-allowed hover:bg-inherit")}
    >
      {checked ? "Присутній" : "Відсутній"}
    </Button>
  );
}


function WizardStepper({
  step,
  createdMatchId,
  onGo,
}: {
  step: Step;
  createdMatchId: string | null;
  onGo: (next: Step) => void | Promise<void>;
}) {
  const steps: { n: Step; title: string }[] = [
    { n: 1, title: "Матч" },
    { n: 2, title: "Склад" },
    { n: 3, title: "Події" },
  ];

  const canGoTo = (n: Step) => {
    if (n === 1) return true;
    if (n === 2) return Boolean(createdMatchId);
    if (n === 3) return Boolean(createdMatchId);
    return false;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, idx) => {
        const isActive = step === s.n;
        const isDone = step > s.n;
        const enabled = canGoTo(s.n);

        return (
          <Button
            key={s.n}
            type="button"
        variant={isActive ? "primary" : "secondary"}
            disabled={!enabled}
            onClick={async () => {
              if (!enabled) return;
              await onGo(s.n);
            }}
            className={cn(
              "h-9 rounded-full px-3",
              !isActive && "bg-muted/40 hover:bg-muted/60",
              isActive && "bg-primary text-primary-foreground"
            )}
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/15 text-[11px] font-semibold">
              {isDone ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span className="text-sm">{s.title}</span>
            {idx < steps.length - 1 ? <span className="ml-2 opacity-50">•</span> : null}
          </Button>
        );
      })}
    </div>
  );
}

function Step1MatchForm({
  form,
  setForm,
  smartInput,
  setSmartInput,
  smartHint,
  smartError,
  tournaments,
  tournamentsLoading,
  mode,
}: {
  form: {
    opponent_name: string;
    opponent_logo_url: string;
    match_date: string;
    home_away: "home" | "away" | "neutral";
    tournament_id: string;
    stage: string;
    matchday: string;
    score_team: string;
    score_opponent: string;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      opponent_name: string;
      opponent_logo_url: string;
      match_date: string;
      home_away: "home" | "away" | "neutral";
      tournament_id: string;
      stage: string;
      matchday: string;
      score_team: string;
      score_opponent: string;
    }>
  >;
  smartInput: string;
  setSmartInput: React.Dispatch<React.SetStateAction<string>>;
  smartHint: string | null;
  smartError: string | null;
  tournaments: DbTournament[];
  tournamentsLoading: boolean;
  mode: "scheduled" | "played";
}) {
  const logoPreview = form.opponent_logo_url.trim();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="opponent">Суперник</Label>
        <Input
          id="opponent"
          value={form.opponent_name}
          onChange={(e) => setForm((p) => ({ ...p, opponent_name: e.target.value }))}
          placeholder="Напр. Віді-трейд-2"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="smartDate">Дата та час</Label>

        <div className="space-y-2">

          <Input
            id="smartDate"
            value={smartInput}
            onChange={(e) => setSmartInput(e.target.value)}
            placeholder="Напр: 27 вер 14:40 / 27.09 14:40 / вчора 19:00 / сб 14:50"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />

          {smartHint ? <div className="text-xs text-muted-foreground">{smartHint}</div> : null}
          {smartError ? <div className="text-xs text-destructive">{smartError}</div> : null}

          {form.match_date ? (
            <div className="text-xs text-muted-foreground">
              Збережеться як: <span className="font-medium text-foreground">{form.match_date.replace("T", " ")}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Поки не розпізнано дату/час.</div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Локація</Label>
        <Select value={form.home_away} onValueChange={(v) => setForm((p) => ({ ...p, home_away: v as any }))}>
          <SelectTrigger>
            <SelectValue placeholder="Обери" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="home">Дім</SelectItem>
            <SelectItem value="away">Виїзд</SelectItem>
            <SelectItem value="neutral">Нейтрально</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Тур (опційно)</Label>
        <Input
          type="number"
          min={1}
          value={form.matchday}
          onChange={(e) => setForm((p) => ({ ...p, matchday: e.target.value }))}
          placeholder="Напр. 4"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Турнір (опційно)</Label>
        <Select value={form.tournament_id} onValueChange={(v) => setForm((p) => ({ ...p, tournament_id: v }))}>
          <SelectTrigger>
            <SelectValue placeholder={tournamentsLoading ? "Завантаження…" : "Без турніру"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без турніру</SelectItem>
            {tournaments.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {tournamentLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="stage">Стадія / примітка (опційно)</Label>
        <Input
          id="stage"
          value={form.stage}
          onChange={(e) => setForm((p) => ({ ...p, stage: e.target.value }))}
          placeholder="1/4 фіналу, група A, товариський матч…"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="logo">Лого суперника (URL, опційно)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full border border-border bg-muted/40 flex items-center justify-center">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Opponent logo"
                className="h-full w-full object-cover"
                style={{ objectPosition: "50% 50%" }}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          <Input
            id="logo"
            value={form.opponent_logo_url}
            onChange={(e) => setForm((p) => ({ ...p, opponent_logo_url: e.target.value }))}
            placeholder="https://.../logo.png"
            className="min-w-[280px] flex-1"
          />
        </div>
        <div className="text-xs text-muted-foreground">Можна вставити прямий URL на png/jpg/webp або svg (якщо браузер дозволяє).</div>
      </div>

      {mode === "played" ? (
        <>
          <div className="space-y-2">
            <Label>Наш рахунок</Label>
            <Input
              type="number"
              min={0}
              value={form.score_team}
              onChange={(e) => setForm((p) => ({ ...p, score_team: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Рахунок суперника</Label>
            <Input
              type="number"
              min={0}
              value={form.score_opponent}
              onChange={(e) => setForm((p) => ({ ...p, score_opponent: e.target.value }))}
              placeholder="0"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function AttendanceCard({
  p,
  present,
  savingOne,
  disabled,
  onToggle,
}: {
  p: Player;
  present: boolean;
  savingOne: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const name = fullName(p);
  const fallback = (p.first_name?.[0] || "") + (p.last_name?.[0] || "");
  const photo = (p.photo_url || "").trim();

  return (
    <div className={cn("rounded-[var(--radius-inner)] border border-border bg-card/40 px-4 py-3", savingOne && "opacity-90")}>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 overflow-hidden rounded-full border border-border bg-muted/40 flex items-center justify-center">
          {photo ? (
            <img
              src={photo}
              alt={name}
              className="h-full w-full object-cover"
              style={{ transform: "scale(1.6) translateY(6px)", transformOrigin: "50% 35%" }}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">{fallback || "?"}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {p.shirt_number ? `№${p.shirt_number} ` : ""}
            {name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatPosition(p.position)}</div>
        </div>

<div className="flex items-center gap-3">
  <AttendancePillToggle checked={present} disabled={disabled} onCheckedChange={onToggle} />
</div>


      </div>
    </div>
  );
}

function Step2Attendance({
  players,
  playersLoading,
  attendanceLoading,
  createdMatchId,
  attendanceMap,
  attendanceSavingMap,
  emptyMessage,
  onToggleOne,
}: {
  players: Player[];
  playersLoading: boolean;
  attendanceLoading: boolean;
  createdMatchId: string | null;
  attendanceMap: Record<string, boolean>;
  attendanceSavingMap: Record<string, boolean>;
  emptyMessage?: string;
  onToggleOne: (playerId: string, next: boolean) => Promise<void>;
}) {
  const presentCount = players.reduce((acc, p) => acc + (attendanceMap[p.id] ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Присутні:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {presentCount}
          </span>
          {players.length ? (
            <span className="text-muted-foreground/60"> / {players.length}</span>
          ) : null}
        </div>
      </div>

      {playersLoading ? (
        <div className="text-sm text-muted-foreground">Завантаження гравців…</div>
      ) : players.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Немає гравців</AlertTitle>
          <AlertDescription>
            {emptyMessage ?? "Не знайшов жодного гравця для команди. Перевір, що `players.team_id` заповнений."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {players.map((p) => {
            const present = Boolean(attendanceMap[p.id]);
            const savingOne = Boolean(attendanceSavingMap[p.id]);
            const disabled = !createdMatchId || attendanceLoading || savingOne;

            return (
              <AttendanceCard
                key={p.id}
                p={p}
                present={present}
                savingOne={savingOne}
                disabled={disabled}
                onToggle={async (next) => {
                  await onToggleOne(p.id, next);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function InlineMatchEventsStep({
  matchId,
  onDone,
}: {
  matchId: string;
  onDone: () => void;
}) {
  const [players, setPlayers] = React.useState<Player[]>([]);
  const [presentIds, setPresentIds] = React.useState<Set<string>>(new Set());
  const [events, setEvents] = React.useState<MatchEvent[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<"create" | "edit">("create");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"table" | "timeline">("table");

const [form, setForm] = React.useState<InlineEventFormState>({
  eventType: "goal",
  playerId: "none",
  assistPlayerId: "none",
  minute: "",
});


  const formRef = React.useRef<HTMLDivElement | null>(null);
  const minuteInputRef = React.useRef<HTMLInputElement | null>(null);

  const playerLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) {
      const num = p.shirt_number !== null && p.shirt_number !== undefined ? `№${p.shirt_number} ` : "";
      map.set(p.id, `${num}${p.last_name} ${p.first_name}`.trim());
    }
    return map;
  }, [players]);

  const presentPlayers = React.useMemo(() => players.filter((p) => presentIds.has(p.id)), [players, presentIds]);
  const hasAttendance = presentPlayers.length > 0;

  const canHaveAssist = form.eventType === "goal" || form.eventType === "penalty_scored";
  const assistCandidates = React.useMemo(() => {
  const authorId = form.playerId === "none" ? null : form.playerId;
  return presentPlayers.filter((p) => !authorId || p.id !== authorId);
}, [presentPlayers, form.playerId]);


  const sortedEvents = React.useMemo(() => [...events].sort(sortEventsStable), [events]);

function resetFormKeepType() {
  setForm((prev) => ({ eventType: prev.eventType, playerId: "none", assistPlayerId: "none", minute: "" }));
  setMode("create");
  setEditingId(null);
}


  function enterEdit(ev: MatchEvent) {
    setMode("edit");
    setEditingId(ev.id);
    setForm({
      eventType: ev.event_type,
      playerId: ev.player_id ?? "",
      assistPlayerId: ev.assist_player_id ?? "",
      minute: ev.minute !== null ? String(ev.minute) : "",
    });

    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    setSuccess(null);
    setError(null);
  }

  function exitEdit() {
    resetFormKeepType();
    setSuccess(null);
    setError(null);
  }

  async function loadAll() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const [playersRes, eventsRes, attendanceRes] = await Promise.all([
      supabase.from("players").select("id, first_name, last_name, shirt_number, photo_url, position").eq("team_id", TEAM_ID).order("shirt_number", { ascending: true }),
      supabase.from("match_events").select("*").eq("match_id", matchId),
      supabase.from("match_attendance").select("player_id").eq("match_id", matchId),
    ]);

    if (playersRes.error) {
      setPlayers([]);
      setError(playersRes.error.message || "Не вдалося завантажити гравців");
    } else {
      setPlayers((playersRes.data || []) as Player[]);
    }

    if (eventsRes.error) {
      setEvents([]);
      setError(eventsRes.error.message || "Не вдалося завантажити події");
    } else {
      setEvents((eventsRes.data || []) as MatchEvent[]);
    }

    if (attendanceRes.error) {
      setPresentIds(new Set());
      setError(attendanceRes.error.message || "Не вдалося завантажити присутність");
    } else {
      const ids = new Set<string>();
      (attendanceRes.data || []).forEach((row: any) => {
        if (row.player_id) ids.add(row.player_id);
      });
      setPresentIds(ids);
    }

    setLoading(false);
  }

  async function refreshEventsOnly() {
    const { data, error } = await supabase.from("match_events").select("*").eq("match_id", matchId);
    if (error) {
      setError("Не вдалося оновити список подій");
      return;
    }
    setEvents((data || []) as MatchEvent[]);
  }

  async function recalcScoreTeam() {
    const { data, error } = await supabase
      .from("match_events")
      .select("id, event_type")
      .eq("match_id", matchId)
      .in("event_type", ["goal", "penalty_scored"]);

    if (error) return;

    const newScoreTeam = data ? data.length : 0;
    await supabase.from("matches").update({ score_team: newScoreTeam }).eq("id", matchId);
  }

  async function submitEvent() {
    setError(null);
    setSuccess(null);

    if (!form.eventType) {
      setError("Потрібно обрати тип події");
      return;
    }

   if (!form.playerId || form.playerId === "none") { 
      setError("Потрібно вказати автора події");
      return;
    }

  const minute = toIntOrNull(form.minute);

if (minute !== null && Number.isNaN(minute)) {
  setError("Хвилина має бути невід’ємним числом або порожньою");
  return;
}


    const assistId =
      (form.eventType === "goal" || form.eventType === "penalty_scored") && form.assistPlayerId !== "none"
        ? form.assistPlayerId
        : null;

    setSaving(true);

    if (mode === "create") {
      const { error } = await supabase.from("match_events").insert({
        match_id: matchId,
        team_id: TEAM_ID,
        event_type: form.eventType,
        player_id: form.playerId,
        assist_player_id: assistId,
        minute,
      });

      setSaving(false);

      if (error) {
        setError(error.message || "Не вдалося створити подію");
        return;
      }

      resetFormKeepType();
      await refreshEventsOnly();
      await recalcScoreTeam();

      setSuccess("Подію додано");
      requestAnimationFrame(() => minuteInputRef.current?.focus());
      return;
    }

    if (mode === "edit" && editingId) {
      const { error } = await supabase
        .from("match_events")
        .update({ event_type: form.eventType, player_id: form.playerId, assist_player_id: assistId, minute })
        .eq("id", editingId);

      setSaving(false);

      if (error) {
        setError(error.message || "Не вдалося оновити подію");
        return;
      }

      await refreshEventsOnly();
      await recalcScoreTeam();

      setSuccess("Подію оновлено");
      exitEdit();
      return;
    }

    setSaving(false);
    setError("Невідомий режим");
  }

  async function deleteEvent(ev: MatchEvent) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error } = await supabase.from("match_events").delete().eq("id", ev.id);

    setSaving(false);

    if (error) {
      setError(error.message || "Не вдалося видалити подію");
      return;
    }

    if (mode === "edit" && editingId === ev.id) {
      exitEdit();
    }

    await refreshEventsOnly();
    await recalcScoreTeam();
    setSuccess("Подію видалено");
  }

  function scrollToFormAndFocus() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => minuteInputRef.current?.focus());
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const CONTROL_BASE = cn(
    "h-10 rounded-[var(--radius-lg)] bg-background",
    "border border-input",
    "text-foreground placeholder:text-muted-foreground",
    "transition-colors",
    "hover:border-foreground/20 hover:bg-muted/20",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "[&>svg]:text-muted-foreground [&>svg]:opacity-100 [&>svg]:transition-colors",
    "hover:[&>svg]:text-foreground"
  );

  const CARD_BASE = cn("rounded-3xl", "border border-border", "bg-card");

  if (loading) {
    return <DetailSkeleton />;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Готово</AlertTitle>
          <AlertDescription className="text-sm">{success}</AlertDescription>
        </Alert>
      ) : null}

      {!hasAttendance ? (
        <Alert>
          <Users className="h-4 w-4" />
          <AlertTitle>Немає відмічених присутніх</AlertTitle>
          <AlertDescription className="text-sm">
            Автор події береться тільки з тих, хто “був на матчі”. Повернись на крок 2 і відміть склад — тоді можна швидко вносити голи й картки.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Form */}
      <Card ref={formRef} className={cn(CARD_BASE, "p-6")}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-foreground">{mode === "create" ? "Додати подію" : "Редагувати подію"}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Асист доступний лише для <span className="font-medium">“Гол”</span> і <span className="font-medium">“Пенальті реалізовано”</span>.
              </div>
            </div>

            {mode === "edit" ? (
              <Button type="button" variant="secondary" onClick={exitEdit} disabled={saving}>
                <X className="h-4 w-4" />
                Скасувати
              </Button>
            ) : null}
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Тип події</Label>
              <Select
                value={form.eventType}
                onValueChange={(v) => {
                  const nextType = v as EventType;
                  setForm((prev) => ({
                    ...prev,
                    eventType: nextType,
                    assistPlayerId: nextType === "goal" || nextType === "penalty_scored" ? prev.assistPlayerId : "",
                  }));
                }}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Обрати" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {eventTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Автор події</Label>
              <Select
  value={form.playerId}
  onValueChange={(v) => {
    setForm((prev) => ({
      ...prev,
      playerId: v,
      assistPlayerId: prev.assistPlayerId === v ? "none" : prev.assistPlayerId,
    }));
  }}
  disabled={!hasAttendance}
>

                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder={hasAttendance ? "Обрати гравця" : "Немає присутніх"} />
                </SelectTrigger>
                <SelectContent>
                     <SelectItem value="none">Обрати гравця</SelectItem>
                  {presentPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {playerLabelById.get(p.id) || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Асист (необовʼязково)</Label>
              <Select
                value={canHaveAssist ? (form.assistPlayerId || "none") : "none"}
               onValueChange={(v) => setForm((prev) => ({ ...prev, assistPlayerId: v }))}

                disabled={!canHaveAssist || !hasAttendance}
              >
                <SelectTrigger className={CONTROL_BASE}>
                  <SelectValue placeholder="Без асисту" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без асисту</SelectItem>
                  {assistCandidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {playerLabelById.get(p.id) || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Хвилина (опц.)</Label>
              <Input
                ref={minuteInputRef}
                className={CONTROL_BASE}
                inputMode="numeric"
                type="number"
                min={0}
                placeholder="Не вказано"
                value={form.minute}
                onChange={(e) => setForm((prev) => ({ ...prev, minute: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitEvent();
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={submitEvent} disabled={saving || !hasAttendance}>
              {mode === "create" ? (
                <>
                  <Plus className="h-4 w-4" />
                  Додати
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Оновити
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSuccess(null);
                setError(null);
                resetFormKeepType();
              }}
              disabled={saving}
            >
              Очистити
            </Button>

            <div className="text-xs text-muted-foreground">Порада: внеси серію подій — тип не скидається після додавання.</div>
          </div>
        </div>
      </Card>

      {/* List */}
      <Card className={cn(CARD_BASE, "p-6")}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-foreground">Список подій</div>
              <div className="mt-1 text-sm text-muted-foreground">Сортування: хвилина ↑, далі час створення. Події без хвилини — внизу.</div>
            </div>

            <div className="text-sm text-muted-foreground">
              Всього: <span className="font-medium text-foreground">{events.length}</span>
            </div>
          </div>

          <Tabs value={view} onValueChange={(v) => setView(v as any)} className="w-full">
            <TabsList className={cn("inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1", "bg-muted border border-border")}>
              <TabsTrigger
                value="table"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:text-foreground",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                )}
              >
                Таблиця
              </TabsTrigger>

              <TabsTrigger
                value="timeline"
                className={cn(
                  "h-8 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:text-foreground",
                  "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                )}
              >
                Таймлайн
              </TabsTrigger>
            </TabsList>

            <TabsContent value="table" className="mt-4">
              {sortedEvents.length === 0 ? (
                <div className="rounded-[var(--radius-inner)] border border-border bg-background p-6 text-center">
                  <div className="text-base font-semibold text-foreground">Поки немає подій</div>
                  <div className="mt-2 text-sm text-muted-foreground">Додай першу подію — і тут з’явиться список.</div>
                  <div className="mt-4">
                    <Button onClick={scrollToFormAndFocus}>
                      <Plus className="h-4 w-4" />
                      Додати першу подію
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={cn("overflow-hidden border border-border rounded-[var(--radius-inner)]")}>
                  <Table variant="analytics" size="sm" className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell widthClass="w-[70px]">Хв.</TableHeaderCell>
                        <TableHeaderCell widthClass="w-[220px]">Тип</TableHeaderCell>
                        <TableHeaderCell>Автор</TableHeaderCell>
                        <TableHeaderCell>Асист</TableHeaderCell>
                        <TableHeaderCell widthClass="w-[190px]">Створено</TableHeaderCell>
                        <TableHeaderCell align="right" widthClass="w-[120px]">Дії</TableHeaderCell>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {sortedEvents.map((ev) => {
                        const author = ev.player_id ? playerLabelById.get(ev.player_id) || "Не вказано" : "Не вказано";
                        const assist = ev.assist_player_id ? playerLabelById.get(ev.assist_player_id) || "Не вказано" : "Не вказано";

                        return (
                          <TableRow key={ev.id} className="hover:bg-muted/40 transition-colors">
                            <TableNumericCell align="left" className="align-middle font-medium text-foreground">
                              {typeof ev.minute === "number" ? ev.minute : "Не вказано"}
                            </TableNumericCell>

                            <TableCell className="align-middle">
                              <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5", "text-foreground", eventPillClasses(ev.event_type))}>
                                <span className="inline-flex h-5 w-5 items-center justify-center">{eventIcon(ev.event_type)}</span>
                                <span className="font-semibold">{eventTypeLabels[ev.event_type]}</span>
                              </div>
                            </TableCell>

                            <TableCell className="align-middle font-medium text-foreground">{author}</TableCell>
                            <TableCell className="align-middle text-sm text-muted-foreground">{assist !== "Не вказано" ? `${assist}` : "Не вказано"}</TableCell>
                            <TableCell className="align-middle text-sm text-muted-foreground">{safeDateTimeUA(ev.created_at)}</TableCell>

                            <TableActionCell className="align-middle">
                              <div className="inline-flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="control"
                                  size="icon"
                                  onClick={() => enterEdit(ev)}
                                  disabled={saving}
                                  aria-label="Редагувати"
                                  title="Редагувати"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="controlDestructive"
                                  size="icon"
                                  onClick={() => deleteEvent(ev)}
                                  disabled={saving}
                                  aria-label="Видалити"
                                  title="Видалити"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableActionCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {sortedEvents.length === 0 ? (
                <div className="rounded-[var(--radius-inner)] border border-border bg-background p-6 text-center">
                  <div className="text-base font-semibold text-foreground">Поки немає подій</div>
                  <div className="mt-2 text-sm text-muted-foreground">Додай першу подію — і тут з’явиться таймлайн.</div>
                  <div className="mt-4">
                    <Button onClick={scrollToFormAndFocus}>
                      <Plus className="h-4 w-4" />
                      Додати першу подію
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-inner)] border border-border bg-background p-4">
                  <div className="space-y-2">
                    {sortedEvents.map((ev) => {
                      const author = ev.player_id ? playerLabelById.get(ev.player_id) || "Не вказано" : "Не вказано";
                      const assist = ev.assist_player_id ? playerLabelById.get(ev.assist_player_id) || "Не вказано" : null;

                      return (
                        <div key={ev.id} className="group flex items-start justify-between gap-3 rounded-[var(--radius-inner)] border border-border bg-card p-4 hover:bg-muted/20">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border bg-background">
                              {ev.minute !== null ? <span className="text-sm font-semibold tabular-nums">{ev.minute}</span> : <span className="text-xs text-muted-foreground">Н/Д</span>}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {eventIcon(ev.event_type)}
                                <div className="font-semibold text-foreground">{eventTypeLabels[ev.event_type]}</div>
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                <span className="text-foreground/90">{author}</span>
                                {assist ? (
                                  <>
                                    <span className="mx-2 text-muted-foreground">•</span>
                                    <span>Асист: {assist}</span>
                                  </>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{safeDateTimeUA(ev.created_at)}</div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="control"
                              size="icon"
                              onClick={() => enterEdit(ev)}
                              disabled={saving}
                              aria-label="Редагувати"
                              title="Редагувати"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>

                            <Button
                              type="button"
                              variant="controlDestructive"
                              size="icon"
                              onClick={() => deleteEvent(ev)}
                              disabled={saving}
                              aria-label="Видалити"
                              title="Видалити"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Все вводиш тут — без переходів. Коли завершиш, тисни <span className="font-medium text-foreground">“Готово”</span>.
            </div>

            <Button type="button" onClick={onDone} disabled={saving}>
              <CheckCircle2 className="h-4 w-4" />
              Готово
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function CreateMatchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const modeParam = searchParams.get("mode");
  const mode: "scheduled" | "played" = modeParam === "played" ? "played" : "scheduled";

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [tournaments, setTournaments] = React.useState<DbTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = React.useState(true);

  const [smartInput, setSmartInput] = React.useState("");
  const [smartHint, setSmartHint] = React.useState<string | null>(null);
  const [smartError, setSmartError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    opponent_name: "",
    opponent_logo_url: "",
    match_date: "",
    home_away: "home" as "home" | "away" | "neutral",
    tournament_id: "none",
    stage: "",
    matchday: "",
    score_team: "",
    score_opponent: "",
  });

  const [step, setStep] = React.useState<Step>(1);
  const [createdMatchId, setCreatedMatchId] = React.useState<string | null>(null);

  const [playersLoading, setPlayersLoading] = React.useState(false);
  const [players, setPlayers] = React.useState<Player[]>([]);

  const [attendanceLoading, setAttendanceLoading] = React.useState(false);
  const [attendanceMap, setAttendanceMap] = React.useState<Record<string, boolean>>({});
  const [attendanceSavingMap, setAttendanceSavingMap] = React.useState<Record<string, boolean>>({});
  const [rosterSyncing, setRosterSyncing] = React.useState(false);
  const [rosterIds, setRosterIds] = React.useState<Set<string> | null>(null);

  // щоб швидкі кліки не ламали стан
  const attendanceReqSeqRef = React.useRef<Record<string, number>>({});
  const rosterAutoAppliedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    async function loadTournaments() {
      setTournamentsLoading(true);

      const { data, error } = await supabase
        .from("team_tournaments")
        .select(
          `
          tournament_id,
          is_primary,
          tournaments (
            id,
            name,
            short_name,
            season,
            league_name
          )
        `
        )
        .eq("team_id", TEAM_ID);

      setTournamentsLoading(false);

      if (error) {
        setTournaments([]);
        return;
      }

      const rows = (data || []) as TeamTournamentRow[];

      const list = rows
        .flatMap((r) => {
          const t = r.tournaments;
          if (!t) return [];
          return Array.isArray(t) ? t : [t];
        })
        .filter((t): t is DbTournament => Boolean(t));

      const primary = rows.find((r) => r.is_primary)?.tournament_id || null;

      const unique = Array.from(new Map(list.map((t) => [t.id, t])).values());

      const sorted = unique.slice().sort((a, b) => {
        if (primary) {
          if (a.id === primary && b.id !== primary) return -1;
          if (b.id === primary && a.id !== primary) return 1;
        }
        const as = (a.season || "").trim();
        const bs = (b.season || "").trim();
        if (as !== bs) return bs.localeCompare(as);
        return (a.name || "").localeCompare(b.name || "");
      });

      setTournaments(sorted);

      if (primary) {
        setForm((p) => ({ ...p, tournament_id: primary }));
      }
    }

    loadTournaments();
  }, []);

  React.useEffect(() => {
    async function loadRoster() {
      if (form.tournament_id === "none") {
        setRosterIds(null);
        return;
      }

      const { data, error } = await supabase
        .from("team_tournament_players")
        .select("player_id")
        .eq("team_id", TEAM_ID)
        .eq("tournament_id", form.tournament_id);

      if (error) {
        setRosterIds(new Set());
        setError(error.message);
        return;
      }

      const ids = (data || []).map((r: { player_id: string }) => r.player_id);
      setRosterIds(new Set(ids));
    }

    loadRoster();
  }, [form.tournament_id]);

  // Автопарс + автозастосування
  React.useEffect(() => {
    if (!smartInput.trim()) {
      setSmartHint(null);
      setSmartError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      const parsed = parseSmartDateTime(smartInput);
      if (!parsed) {
        setSmartHint(null);
        setSmartError("Не можу розпізнати. Приклад: 27.09 14:40 / 27 вер 14:40 / вчора 19:00 / сб 14:50");
        return;
      }

      setSmartError(null);
      setSmartHint(`Розпізнано: ${formatHuman(parsed.date)}${parsed.confidence === "medium" ? " (рік/день уточнюється)" : ""}`);

      const nextVal = toDatetimeLocalValue(parsed.date);
      setForm((p) => (p.match_date === nextVal ? p : { ...p, match_date: nextVal }));
    }, 220);

    return () => window.clearTimeout(handle);
  }, [smartInput]);

  async function loadPlayersForStep2() {
    setPlayersLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("players")
      .select("id, first_name, last_name, shirt_number, photo_url, position")
      .eq("team_id", TEAM_ID)
      .order("shirt_number", { ascending: true });

    setPlayersLoading(false);

    if (error) {
      setPlayers([]);
      setError(error.message);
      return;
    }

    setPlayers((data || []) as Player[]);
  }

  async function loadAttendance(matchId: string) {
    setAttendanceLoading(true);
    setError(null);

    // без status
    const { data, error } = await supabase.from("match_attendance").select("match_id, player_id").eq("match_id", matchId);

    setAttendanceLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    const map: Record<string, boolean> = {};
    for (const row of (data || []) as AttendanceRow[]) {
      map[row.player_id] = true;
    }
    setAttendanceMap(map);
  }

  const applyTournamentRosterToMatch = React.useCallback(async (matchId: string) => {
    if (form.tournament_id === "none") return;

    setRosterSyncing(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("team_tournament_players")
        .select("player_id")
        .eq("team_id", TEAM_ID)
        .eq("tournament_id", form.tournament_id);

      if (error) throw error;

      const ids = (data || []).map((r: { player_id: string }) => r.player_id).filter(Boolean);
      if (ids.length === 0) {
        setError("У заявці турніру немає гравців");
        return;
      }

      const payload = ids.map((player_id) => ({ match_id: matchId, player_id }));
      const { error: upsertErr } = await supabase
        .from("match_attendance")
        .upsert(payload, { onConflict: "match_id,player_id" });

      if (upsertErr) throw upsertErr;

      setAttendanceMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => { next[id] = true; });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося перенести склад");
    } finally {
      setRosterSyncing(false);
    }
  }, [form.tournament_id]);

  React.useEffect(() => {
    if (!createdMatchId) return;
    if (form.tournament_id === "none") return;
    if (attendanceLoading || rosterSyncing) return;
    if (Object.keys(attendanceMap).length > 0) return;
    if (rosterAutoAppliedRef.current === createdMatchId) return;

    rosterAutoAppliedRef.current = createdMatchId;
    applyTournamentRosterToMatch(createdMatchId);
  }, [attendanceLoading, attendanceMap, applyTournamentRosterToMatch, createdMatchId, form.tournament_id, rosterSyncing]);

  async function setPlayerAttendance(matchId: string, playerId: string, present: boolean) {
    const nextSeq = (attendanceReqSeqRef.current[playerId] || 0) + 1;
    attendanceReqSeqRef.current[playerId] = nextSeq;

    // optimistic
    setAttendanceMap((p) => ({ ...p, [playerId]: present }));
    setAttendanceSavingMap((p) => ({ ...p, [playerId]: true }));
    setError(null);

    try {
      if (present) {
        const { error } = await supabase
          .from("match_attendance")
          .upsert({ match_id: matchId, player_id: playerId }, { onConflict: "match_id,player_id" });

        if (attendanceReqSeqRef.current[playerId] !== nextSeq) return;

        setAttendanceSavingMap((p) => ({ ...p, [playerId]: false }));

        if (error) {
          setAttendanceMap((p) => ({ ...p, [playerId]: false }));
          setError(error.message);
        }
      } else {
        const { error } = await supabase.from("match_attendance").delete().eq("match_id", matchId).eq("player_id", playerId);

        if (attendanceReqSeqRef.current[playerId] !== nextSeq) return;

        setAttendanceSavingMap((p) => ({ ...p, [playerId]: false }));

        if (error) {
          setAttendanceMap((p) => ({ ...p, [playerId]: true }));
          setError(error.message);
        }
      }
    } catch (e) {
      if (attendanceReqSeqRef.current[playerId] !== nextSeq) return;
      setAttendanceSavingMap((p) => ({ ...p, [playerId]: false }));
      setAttendanceMap((p) => ({ ...p, [playerId]: !present }));
      setError(e instanceof Error ? e.message : "Помилка при збереженні");
    }
  }

  async function setAllPresent(matchId: string) {
    if (!players.length) return;

    for (const pl of players) {
      const nextSeq = (attendanceReqSeqRef.current[pl.id] || 0) + 1;
      attendanceReqSeqRef.current[pl.id] = nextSeq;
    }

    setAttendanceMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = true;
      return next;
    });
    setAttendanceSavingMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = true;
      return next;
    });

    const payload = players.map((pl) => ({ match_id: matchId, player_id: pl.id }));
    const { error } = await supabase.from("match_attendance").upsert(payload, { onConflict: "match_id,player_id" });

    setAttendanceSavingMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = false;
      return next;
    });

    if (error) {
      setError(error.message);
      await loadAttendance(matchId);
    }
  }

  async function clearAll(matchId: string) {
    if (!players.length) {
      const { error } = await supabase.from("match_attendance").delete().eq("match_id", matchId);
      if (error) setError(error.message);
      setAttendanceMap({});
      return;
    }

    for (const pl of players) {
      const nextSeq = (attendanceReqSeqRef.current[pl.id] || 0) + 1;
      attendanceReqSeqRef.current[pl.id] = nextSeq;
    }

    setAttendanceMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = false;
      return next;
    });
    setAttendanceSavingMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = true;
      return next;
    });

    const { error } = await supabase.from("match_attendance").delete().eq("match_id", matchId);

    setAttendanceSavingMap(() => {
      const next: Record<string, boolean> = {};
      for (const pl of players) next[pl.id] = false;
      return next;
    });

    if (error) {
      setError(error.message);
      await loadAttendance(matchId);
    }
  }

  function validateStep1Base() {
    const opponent = form.opponent_name.trim();
    if (!opponent) return "Вкажи назву суперника";
    if (!form.match_date) return "Вкажи дату та час матчу (через швидкий ввід)";
    if (!isValidHttpUrlMaybeEmpty(form.opponent_logo_url)) return "Лого суперника має бути валідним URL (http/https) або порожнім";

    const matchdayNum = form.matchday.trim() === "" ? null : Number(form.matchday);
    if (matchdayNum !== null && (Number.isNaN(matchdayNum) || matchdayNum < 1)) return "Тур має бути числом (>= 1) або порожнім";

    const dateObj = new Date(form.match_date);
    if (Number.isNaN(dateObj.getTime())) return "Некоректна дата/час";

    return null;
  }

  async function createMatchScheduled() {
    setError(null);

    const baseErr = validateStep1Base();
    if (baseErr) {
      setError(baseErr);
      return;
    }

    setSaving(true);

    const dateObj = new Date(form.match_date);
    const matchdayNum = form.matchday.trim() === "" ? null : Number(form.matchday);

    const { data, error } = await supabase
      .from("matches")
      .insert({
        team_id: TEAM_ID,
        opponent_name: form.opponent_name.trim(),
        opponent_logo_url: form.opponent_logo_url.trim() ? form.opponent_logo_url.trim() : null,
        match_date: dateObj.toISOString(),
        home_away: form.home_away,
        tournament_id: form.tournament_id === "none" ? null : form.tournament_id,
        stage: form.stage.trim() ? form.stage.trim() : null,
        matchday: matchdayNum,
        status: "scheduled",
        score_team: null,
        score_opponent: null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data?.id) {
      setError(error?.message || "Не вдалося створити матч");
      return;
    }

    const eventDate = dateObj.toISOString().slice(0, 10);
    const eventTime = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;

    logActivity({
      teamId: TEAM_ID,
      action: "create_match",
      entityType: "matches",
      entityId: data.id,
      title: `Створено матч проти ${form.opponent_name.trim()}`,
      href: `/matches/${data.id}`,
      metadata: {
        event_date: eventDate,
        event_time: eventTime,
      },
    });
    navigate(`/matches/${data.id}`);
  }

  async function wizardNextFromStep1() {
    setError(null);

    const baseErr = validateStep1Base();
    if (baseErr) {
      setError(baseErr);
      return;
    }

    const a = parseNonNegativeInt(form.score_team);
    const b = parseNonNegativeInt(form.score_opponent);
    if (a === null) {
      setError("Наш рахунок має бути цілим числом >= 0");
      return;
    }
    if (b === null) {
      setError("Рахунок суперника має бути цілим числом >= 0");
      return;
    }

    setSaving(true);

    const dateObj = new Date(form.match_date);
    const matchdayNum = form.matchday.trim() === "" ? null : Number(form.matchday);

    const { data, error } = await supabase
      .from("matches")
      .insert({
        team_id: TEAM_ID,
        opponent_name: form.opponent_name.trim(),
        opponent_logo_url: form.opponent_logo_url.trim() ? form.opponent_logo_url.trim() : null,
        match_date: dateObj.toISOString(),
        home_away: form.home_away,
        tournament_id: form.tournament_id === "none" ? null : form.tournament_id,
        stage: form.stage.trim() ? form.stage.trim() : null,
        matchday: matchdayNum,
        status: "played",
        score_team: a,
        score_opponent: b,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data?.id) {
      setError(error?.message || "Не вдалося створити матч");
      return;
    }

    const eventDate = dateObj.toISOString().slice(0, 10);
    const eventTime = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;

    logActivity({
      teamId: TEAM_ID,
      action: "create_match",
      entityType: "matches",
      entityId: data.id,
      title: `Створено матч проти ${form.opponent_name.trim()}`,
      href: `/matches/${data.id}`,
      metadata: {
        event_date: eventDate,
        event_time: eventTime,
      },
    });
    setCreatedMatchId(data.id);

    await loadPlayersForStep2();
    await loadAttendance(data.id);

    setStep(2);
  }

  async function wizardGoToStep2() {
    if (!createdMatchId) return;
    await loadPlayersForStep2();
    await loadAttendance(createdMatchId);
    setStep(2);
  }

  async function wizardGoToStep3() {
    if (!createdMatchId) return;
    setStep(3);
  }

  const CARD_BASE = cn("rounded-3xl border border-border bg-card");
  const visiblePlayers = React.useMemo(() => {
    if (!rosterIds) return players;
    return players.filter((p) => rosterIds.has(p.id));
  }, [players, rosterIds]);

  const headerActions = React.useMemo(
    () => (
      <Button asChild variant="secondary">
        <Link to="/matches-shadcn">До матчів</Link>
      </Button>
    ),
    []
  );

  usePageHeaderActions(headerActions, []);

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Помилка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className={cn(CARD_BASE, "p-6")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-primary/40 bg-primary/5 text-primary">
            <Swords className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">{mode === "played" ? "Додати зіграний матч" : "Новий матч"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {mode === "played" ? "Крок 1: матч → Крок 2: склад → Крок 3: події." : "Заповни мінімум — і перейдеш в деталі матчу."}
            </div>
          </div>
        </div>

        {mode === "played" ? (
          <>
            <Separator className="my-5" />
            <WizardStepper
              step={step}
              createdMatchId={createdMatchId}
              onGo={async (next) => {
                if (next === 1) setStep(1);
                if (next === 2) await wizardGoToStep2();
                if (next === 3) await wizardGoToStep3();
              }}
            />
          </>
        ) : null}

        <Separator className="my-5" />

        {mode === "scheduled" ? (
          <>
            <Step1MatchForm
              form={form}
              setForm={setForm}
              smartInput={smartInput}
              setSmartInput={setSmartInput}
              smartHint={smartHint}
              smartError={smartError}
              tournaments={tournaments}
              tournamentsLoading={tournamentsLoading}
              mode={mode}
            />
            <Separator className="my-5" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={createMatchScheduled} disabled={saving}>
                <CheckCircle2 className="h-4 w-4" />
                Створити матч
              </Button>

              <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
                Скасувати
              </Button>
            </div>
          </>
        ) : (
          <>
            {step === 1 ? (
              <>
                <Step1MatchForm
                  form={form}
                  setForm={setForm}
                  smartInput={smartInput}
                  setSmartInput={setSmartInput}
                  smartHint={smartHint}
                  smartError={smartError}
                  tournaments={tournaments}
                  tournamentsLoading={tournamentsLoading}
                  mode={mode}
                />
                <Separator className="my-5" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
                    Скасувати
                  </Button>

                  <Button onClick={wizardNextFromStep1} disabled={saving}>
                    Далі
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Step2Attendance
                  players={visiblePlayers}
                  playersLoading={playersLoading}
                  attendanceLoading={attendanceLoading}
                  createdMatchId={createdMatchId}
                  attendanceMap={attendanceMap}
                  attendanceSavingMap={attendanceSavingMap}
                  emptyMessage={
                    rosterIds && rosterIds.size === 0
                      ? "У заявці турніру немає гравців."
                      : undefined
                  }
                  onToggleOne={async (playerId, next) => {
                    if (!createdMatchId) return;
                    await setPlayerAttendance(createdMatchId, playerId, next);
                  }}
                />
                <Separator className="my-5" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={saving}>
                    <ChevronLeft className="h-4 w-4" />
                    Назад
                  </Button>

                  <Button type="button" onClick={wizardGoToStep3} disabled={!createdMatchId}>
                    Далі
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                {createdMatchId ? (
                  <InlineMatchEventsStep
                    matchId={createdMatchId}
                    onDone={() => {
                      navigate(`/matches/${createdMatchId}`);
                    }}
                  />
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Немає matchId</AlertTitle>
                    <AlertDescription>Спочатку створи матч.</AlertDescription>
                  </Alert>
                )}

                <Separator className="my-5" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="secondary" onClick={wizardGoToStep2} disabled={!createdMatchId}>
                    <ChevronLeft className="h-4 w-4" />
                    Назад
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      if (!createdMatchId) return;
                      navigate(`/matches/${createdMatchId}`);
                    }}
                    disabled={!createdMatchId}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Готово
                  </Button>
                </div>
              </>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
