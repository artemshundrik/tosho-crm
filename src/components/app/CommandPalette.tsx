import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  BarChart3,
  Blocks,
  CalendarPlus,
  ClipboardList,
  FolderKanban,
  History,
  LayoutGrid,
  Layers,
  Palette,
  Settings,
  SlidersHorizontal,
  Trophy,
  UserPlus,
  Users,
  Search,
  X,
  User,
  Swords,
  Dumbbell,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type RouteItem = {
  key: string;
  label: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type ActionItem = {
  key: string;
  label: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type RecentItem = {
  label: string;
  to: string;
  ts: number;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  shirt_number: number | null;
};

type Training = {
  id: string;
  title: string | null;
  location: string | null;
  training_date: string | null;
};

type Tournament = {
  id: string;
  name: string;
  short_name: string | null;
  league_name: string | null;
  season: string | null;
};

type Opponent = {
  name: string;
};

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";

const RECENTS_KEY = "fayna_cmdk_recents_v1";
const MAX_RECENTS = 8;

function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          typeof x?.to === "string" &&
          typeof x?.label === "string" &&
          typeof x?.ts === "number"
      )
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function saveRecents(items: RecentItem[]) {
  try {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(items.slice(0, MAX_RECENTS))
    );
  } catch {
    // ignore
  }
}

function pushRecent(next: { label: string; to: string }) {
  const current = loadRecents();
  const now = Date.now();
  const filtered = current.filter((x) => x.to !== next.to);
  const updated: RecentItem[] = [{ ...next, ts: now }, ...filtered].slice(
    0,
    MAX_RECENTS
  );
  saveRecents(updated);
}

function pathToLabel(pathname: string): string {
  if (pathname === "/matches") return "Дашборд";
  if (pathname === "/matches-shadcn") return "Матчі Pro";
  if (pathname.startsWith("/admin/trainings")) return "Тренування";
  if (pathname.startsWith("/admin/players")) return "Гравці";
  if (pathname.startsWith("/admin/tournaments")) return "Турніри";
  if (pathname.startsWith("/analytics")) return "Аналітика";
  if (pathname.startsWith("/design-system")) return "Дизайн-система";
  if (pathname.startsWith("/playground")) return "Playground";
  if (pathname.startsWith("/workspace-settings")) return "Налаштування workspace";
  if (pathname.startsWith("/account-settings")) return "Налаштування акаунта";
  if (pathname.startsWith("/profile")) return "Профіль";
  return "Сторінка";
}

function cap(s: string, max = 42) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" });
}

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState("");

  // Dynamic results
  const [players, setPlayers] = useState<Player[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(false);

  const routes: RouteItem[] = useMemo(
    () => [
      {
        key: "route-dashboard",
        label: "Дашборд",
        keywords: ["dashboard", "home", "головна", "матчі", "дашборд"],
        to: "/matches",
        icon: LayoutGrid,
      },
      {
        key: "route-matches-pro",
        label: "Матчі Pro",
        keywords: ["матч", "matches", "pro", "ігри", "результати", "розклад", "спаринг"],
        to: "/matches-shadcn",
        icon: Trophy,
      },
      {
        key: "route-trainings",
        label: "Тренування",
        keywords: ["training", "тренування", "відвідуваність", "attendance"],
        to: "/admin/trainings",
        icon: Layers,
      },
      {
        key: "route-trainings-analytics",
        label: "Аналітика тренувань",
        keywords: ["аналітика тренувань", "відвідуваність", "attendance", "trainings analytics"],
        to: "/admin/trainings/analytics",
        icon: BarChart3,
      },
      {
        key: "route-players",
        label: "Гравці",
        keywords: ["players", "гравці", "склад", "roster"],
        to: "/admin/players",
        icon: Users,
      },
      {
        key: "route-tournaments",
        label: "Турніри",
        keywords: ["tournaments", "турніри", "ліга", "season"],
        to: "/admin/tournaments",
        icon: ClipboardList,
      },
      {
        key: "route-analytics",
        label: "Аналітика",
        keywords: ["analytics", "метрики", "kpi", "stats", "аналітика"],
        to: "/analytics",
        icon: BarChart3,
      },
      {
        key: "route-design-system",
        label: "Дизайн-система",
        keywords: ["design", "system", "tokens", "компоненти", "токени", "ui"],
        to: "/design-system",
        icon: Palette,
      },
      {
        key: "route-playground",
        label: "Playground",
        keywords: ["playground", "demo", "ui", "sandbox", "тест"],
        to: "/playground",
        icon: Blocks,
      },
      {
        key: "route-workspace-settings",
        label: "Налаштування workspace",
        keywords: ["workspace", "team", "roles", "billing", "налаштування команди"],
        to: "/workspace-settings",
        icon: Settings,
      },
      {
        key: "route-account-settings",
        label: "Налаштування акаунта",
        keywords: ["account", "profile", "settings", "мова", "тема"],
        to: "/account-settings",
        icon: SlidersHorizontal,
      },
    ],
    []
  );

  const actions: ActionItem[] = useMemo(
    () => [
      {
        key: "action-create-match",
        label: "Створити матч",
        keywords: ["create", "match", "новий матч", "додати матч", "матч", "спаринг"],
        to: "/admin/matches/new",
        icon: CalendarPlus,
      },
      {
        key: "action-create-training",
        label: "Створити тренування",
        keywords: ["create", "training", "нове тренування", "додати тренування", "тренування"],
        to: "/admin/trainings/new",
        icon: Layers,
      },
      {
        key: "action-add-player",
        label: "Додати гравця",
        keywords: ["add", "player", "новий гравець", "додати гравця", "гравець"],
        to: "/admin/players/new",
        icon: UserPlus,
      },
      {
        key: "action-open-team",
        label: "Перейти в FAYNA TEAM (workspace)",
        keywords: ["workspace", "team", "fayna", "команда", "простір"],
        to: "/matches",
        icon: FolderKanban,
      },
    ],
    []
  );

  useEffect(() => {
    const label = pathToLabel(location.pathname);
    pushRecent({ label, to: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (e.key === "/") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isTypingField =
          tag === "input" ||
          tag === "textarea" ||
          target?.getAttribute?.("contenteditable") === "true";

        if (!isTypingField) {
          e.preventDefault();
          onOpenChange(true);
        }
      }

      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // reset search on open
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const recents = useMemo(() => loadRecents(), [open]);

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  function clearQuery(e?: React.SyntheticEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setQuery("");
  }

  // ===== Dynamic search (Supabase) =====
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!open) return;

      const q = normalizeText(query);
      if (q.length < 2) {
        setPlayers([]);
        setTrainings([]);
        setTournaments([]);
        setOpponents([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      // cmdk + Postgres: робимо "contains" через ilike
      const like = `%${q}%`;

      const playersReq = supabase
        .from("players")
        .select("id, first_name, last_name, shirt_number")
        .eq("team_id", TEAM_ID)
        .or(`first_name.ilike.${like},last_name.ilike.${like}`)
        .limit(8);

      const trainingsReq = supabase
        .from("trainings")
        .select("id, title, location, training_date")
        .eq("team_id", TEAM_ID)
        .or(`title.ilike.${like},location.ilike.${like}`)
        .order("training_date", { ascending: false })
        .limit(8);

      const tournamentsReq = supabase
        .from("tournaments")
        .select("id, name, short_name, league_name, season")
        .eq("team_id", TEAM_ID)
        .or(`name.ilike.${like},short_name.ilike.${like},league_name.ilike.${like},season.ilike.${like}`)
        .limit(8);

      // суперники/команди: дістаємо з matches унікальні opponent_name
      const opponentsReq = supabase
        .from("matches")
        .select("opponent_name")
        .eq("team_id", TEAM_ID)
        .ilike("opponent_name", like)
        .limit(50);

      const [pRes, tRes, tourRes, oRes] = await Promise.all([
        playersReq,
        trainingsReq,
        tournamentsReq,
        opponentsReq,
      ]);

      if (cancelled) return;

      setPlayers((pRes.data as Player[] | null) ?? []);
      setTrainings((tRes.data as Training[] | null) ?? []);
      setTournaments((tourRes.data as Tournament[] | null) ?? []);

      const rawOpp = ((oRes.data as { opponent_name: string | null }[] | null) ?? [])
        .map((x) => (x.opponent_name ?? "").trim())
        .filter(Boolean);

      const uniq = Array.from(new Set(rawOpp))
        .slice(0, 8)
        .map((name) => ({ name }));

      setOpponents(uniq);
      setLoading(false);
    }

    run().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, query]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Пошук сторінок, дій, гравців, команд…"
        leftIcon={<Search className="h-4 w-4" />}
        rightSlot={
          <div className="flex items-center gap-2">
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Очистити пошук"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={clearQuery}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <kbd className="inline-flex h-7 select-none items-center gap-1 rounded-md border border-border bg-muted px-2 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-[11px]">⌘</span>K
              <span className="opacity-60">/</span>
              <span>Ctrl+K</span>
            </kbd>
          </div>
        }
      />

      <CommandList className="py-1">
        <CommandEmpty>
          {loading && query.trim().length >= 2 ? "Шукаю…" : "Нічого не знайдено."}
        </CommandEmpty>

        {recents.length > 0 && (
          <>
            <CommandGroup heading="Останні">
              {recents.map((r) => (
                <CommandItem
                  key={`recent-${r.to}`}
                  value={normalizeText(`${r.label} ${r.to}`)}
                  onSelect={() => go(r.to)}
                >
                  <History className="mr-2 h-4 w-4" />
                  <span className="flex-1">{r.label}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {r.to}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ===== Dynamic: Players ===== */}
        {players.length > 0 && (
          <>
            <CommandGroup heading="Гравці">
              {players.map((p) => {
                const full = [p.first_name ?? "", p.last_name ?? ""].join(" ").trim();
                const label = full || "Гравець";
                const number = p.shirt_number != null ? `#${p.shirt_number}` : "";
                const value = normalizeText([label, number, "гравець", "player"].join(" "));
                return (
                  <CommandItem
                    key={`player-${p.id}`}
                    value={value}
                    onSelect={() => go(`/admin/players/${p.id}`)}
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span className="flex-1">{label}</span>
                    {number && <span className="text-xs text-muted-foreground">{number}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ===== Dynamic: Opponents (Teams) ===== */}
        {opponents.length > 0 && (
          <>
            <CommandGroup heading="Команди / Суперники">
              {opponents.map((o) => (
                <CommandItem
                  key={`opp-${o.name}`}
                  value={normalizeText([o.name, "команда", "суперник", "opponent", "team"].join(" "))}
                  onSelect={() => go(`/matches-shadcn?opponent=${encodeURIComponent(o.name)}`)}
                >
                  <Swords className="mr-2 h-4 w-4" />
                  <span className="flex-1">{cap(o.name)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ===== Dynamic: Trainings ===== */}
        {trainings.length > 0 && (
          <>
            <CommandGroup heading="Тренування">
              {trainings.map((t) => {
                const title = (t.title ?? "Тренування").trim();
                const loc = (t.location ?? "").trim();
                const date = fmtDate(t.training_date);
                const value = normalizeText([title, loc, date, "тренування", "training"].join(" "));
                return (
                  <CommandItem
                    key={`training-${t.id}`}
                    value={value}
                    onSelect={() => go(`/admin/trainings/${t.id}`)}
                  >
                    <Dumbbell className="mr-2 h-4 w-4" />
                    <span className="flex-1">{cap(title)}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {[date, loc].filter(Boolean).join(" · ")}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ===== Dynamic: Tournaments ===== */}
        {tournaments.length > 0 && (
          <>
            <CommandGroup heading="Турніри">
              {tournaments.map((t) => {
                const meta = [t.short_name, t.league_name, t.season].filter(Boolean).join(" · ");
                const value = normalizeText(
                  [t.name, t.short_name ?? "", t.league_name ?? "", t.season ?? "", "турнір", "tournament"].join(" ")
                );
                return (
                  <CommandItem
                    key={`tournament-${t.id}`}
                    value={value}
                    onSelect={() => go(`/admin/tournaments/${t.id}`)}
                  >
                    <ClipboardList className="mr-2 h-4 w-4" />
                    <span className="flex-1">{cap(t.name)}</span>
                    {meta && (
                      <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {cap(meta, 32)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ===== Actions ===== */}
        <CommandGroup heading="Швидкі дії">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.key}
                value={normalizeText([a.label, ...a.keywords, a.to].join(" "))}
                onSelect={() => go(a.to)}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{a.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* ===== Pages ===== */}
        <CommandGroup heading="Сторінки">
          {routes.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.key}
                value={normalizeText([r.label, ...r.keywords, r.to].join(" "))}
                onSelect={() => go(r.to)}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span className="flex-1">{r.label}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {r.to}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
