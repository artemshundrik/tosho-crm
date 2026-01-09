import { useMemo, useState } from "react";

import {
  type ImportRunSummary,
  type MatchItem,
  type ParsedTournamentData,
} from "@/features/tournamentImport/types";
import { normalizeSpace } from "@/features/tournamentImport/textUtils";
import { parseStandingsFromText } from "@/features/tournamentImport/parseStandingsFromText";
import { parseCalendarMatchesFromText } from "@/features/tournamentImport/parseCalendarMatchesFromText";

type LoadState = "idle" | "loading" | "ready" | "error";

type CopyError = {
  key: string;
  message: string;
} | null;

type RunMeta = Pick<ImportRunSummary, "run_id" | "snapshot_file" | "parsed_at">;

const STANDINGS_LABEL = "Турнірна таблиця";
const MATCHES_LABEL = "Календар матчів";
const SNAPSHOT_FILE = "/snapshots/v9ky-gold-league.html";

function extractBlock(source: string, startLabel: string, endLabel?: string) {
  const startIndex = source.indexOf(startLabel);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = endLabel ? source.indexOf(endLabel, startIndex + startLabel.length) : -1;
  const sliceEnd = endIndex === -1 ? source.length : endIndex;

  return source.slice(startIndex, sliceEnd).trim();
}

function toPreview(block: string | null, maxLength = 420) {
  if (!block) return "";
  if (block.length <= maxLength) return block;
  return `${block.slice(0, maxLength)}…`;
}

function matchesOurTeam(match: MatchItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return (
    match.home_team.toLowerCase().includes(needle) ||
    match.away_team.toLowerCase().includes(needle)
  );
}

export default function TournamentImportLabPage() {
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<CopyError>(null);
  const [normalizedText, setNormalizedText] = useState<string>("");
  const [standingsBlock, setStandingsBlock] = useState<string | null>(null);
  const [matchesBlock, setMatchesBlock] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedTournamentData | null>(null);
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [ourTeamQuery, setOurTeamQuery] = useState<string>("FAYNA");
  const [onlyOurTeam, setOnlyOurTeam] = useState<boolean>(false);

  const handleLoad = async () => {
    setState("loading");
    setError(null);

    try {
      const response = await fetch(SNAPSHOT_FILE, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load snapshot: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const textContent = doc.body.textContent ?? "";
      const normalized = normalizeSpace(textContent);

      const standingsBlockText = extractBlock(normalized, STANDINGS_LABEL, MATCHES_LABEL);
      const matchesBlockText = extractBlock(normalized, MATCHES_LABEL);

      const standings = parseStandingsFromText(textContent);
      const matches = parseCalendarMatchesFromText(textContent);

      const parsedData: ParsedTournamentData = {
        standings,
        matches,
      };

      setNormalizedText(normalized);
      setStandingsBlock(standingsBlockText);
      setMatchesBlock(matchesBlockText);
      setParsed(parsedData);

      setRunMeta({
        run_id: crypto.randomUUID(),
        snapshot_file: SNAPSHOT_FILE,
        parsed_at: new Date().toISOString(),
      });

      setState("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setState("error");
    }
  };

  const filteredMatches = useMemo(() => {
    if (!parsed) return [] as MatchItem[];
    if (!onlyOurTeam) return parsed.matches;
    return parsed.matches.filter((match) => matchesOurTeam(match, ourTeamQuery));
  }, [onlyOurTeam, ourTeamQuery, parsed]);

  const ourTeamMatchesCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.matches.filter((match) => matchesOurTeam(match, ourTeamQuery)).length;
  }, [parsed, ourTeamQuery]);

  const runSummary = useMemo<ImportRunSummary | null>(() => {
    if (!runMeta || !parsed) return null;
    return {
      run_id: runMeta.run_id,
      snapshot_file: runMeta.snapshot_file,
      parsed_at: runMeta.parsed_at,
      standings_rows: parsed.standings.rows.length,
      matches_found: parsed.matches.length,
      our_team_matches: ourTeamMatchesCount,
      filters: {
        our_team_query: ourTeamQuery,
        only_our_team: onlyOurTeam,
      },
    };
  }, [onlyOurTeam, ourTeamMatchesCount, ourTeamQuery, parsed, runMeta]);

  const summaryLine = useMemo(() => {
    if (!runSummary) return null;
    const shortId = runSummary.run_id.slice(0, 8);
    const parsedAt = new Date(runSummary.parsed_at).toLocaleString("uk-UA", {
      hour12: false,
    });
    return `Run: ${shortId} • Parsed: ${parsedAt} • Standings: ${runSummary.standings_rows} • Matches: ${runSummary.matches_found} • Our team: ${runSummary.our_team_matches}`;
  }, [runSummary]);

  const standingsJson = useMemo(() => {
    if (!parsed) return "";
    return JSON.stringify(parsed.standings, null, 2);
  }, [parsed]);

  const matchesJson = useMemo(() => {
    if (!parsed) return "";
    return JSON.stringify(
      {
        matches: parsed.matches,
        filteredMatches,
      },
      null,
      2,
    );
  }, [filteredMatches, parsed]);

  const summaryJson = useMemo(() => {
    if (!runSummary) return "";
    return JSON.stringify(runSummary, null, 2);
  }, [runSummary]);

  const handleCopy = async (key: string, payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopyError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не вдалося скопіювати JSON";
      setCopyError({ key, message });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Tournament Import Lab</h1>
        <p className="text-sm text-muted-foreground">
          DEV-only sandbox for parsing v9ky snapshots without touching production flows.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLoad}
            disabled={state === "loading"}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "loading" ? "Завантаження..." : "Завантажити snapshot"}
          </button>
          <div className="text-xs text-muted-foreground">
            {state === "idle" && "Очікує на завантаження"}
            {state === "ready" && "Snapshot готовий"}
            {state === "error" && "Помилка під час завантаження"}
          </div>
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-foreground">
            <span className="text-xs font-semibold text-muted-foreground">Наша команда (фільтр)</span>
            <input
              value={ourTeamQuery}
              onChange={(event) => setOurTeamQuery(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              type="text"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={onlyOurTeam}
              onChange={(event) => setOnlyOurTeam(event.target.checked)}
              className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span>Показувати тільки матчі нашої команди</span>
          </label>
        </div>

        {summaryLine ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {summaryLine}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Standings block</h2>
            <span className="text-xs text-muted-foreground">{standingsBlock?.length ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(standingsBlock)}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Parsed standings JSON</span>
            <button
              type="button"
              onClick={() => handleCopy("standings", standingsJson || "{}")}
              className="text-xs font-semibold text-primary hover:underline"
              disabled={!standingsJson}
            >
              Скопіювати JSON
            </button>
          </div>
          {copyError?.key === "standings" ? (
            <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
          ) : null}
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {standingsJson || "{}"}
          </pre>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Calendar matches block</h2>
            <span className="text-xs text-muted-foreground">{matchesBlock?.length ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(matchesBlock)}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Parsed matches JSON · {filteredMatches.length} shown
            </span>
            <button
              type="button"
              onClick={() => handleCopy("matches", matchesJson || "{}")}
              className="text-xs font-semibold text-primary hover:underline"
              disabled={!matchesJson}
            >
              Скопіювати JSON
            </button>
          </div>
          {copyError?.key === "matches" ? (
            <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
          ) : null}
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {matchesJson || "{}"}
          </pre>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Run summary</h2>
          <span className="text-xs text-muted-foreground">{normalizedText.length} chars</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">ImportRunSummary JSON</span>
          <button
            type="button"
            onClick={() => handleCopy("summary", summaryJson || "{}")}
            className="text-xs font-semibold text-primary hover:underline"
            disabled={!summaryJson}
          >
            Скопіювати JSON
          </button>
        </div>
        {copyError?.key === "summary" ? (
          <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
        ) : null}
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground">
          {summaryJson || "{}"}
        </pre>
      </section>
    </div>
  );
}
