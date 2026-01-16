import { useEffect, useMemo, useRef, useState } from "react";

import {
  type ImportRunSummary,
  type MatchItem,
  type ParsedTournamentData,
  type ParserMode,
} from "@/features/tournamentImport/types";
import { normalizeSpace } from "@/features/tournamentImport/textUtils";
import { parseHtmlToDocument } from "@/features/tournamentImport/domUtils";
import { parseStandingsFromText } from "@/features/tournamentImport/parseStandingsFromText";
import { parseCalendarMatchesFromText } from "@/features/tournamentImport/parseCalendarMatchesFromText";
import { parseStandingsFromDOM } from "@/features/tournamentImport/parseStandingsFromDOM";
import {
  parseCalendarMatchesFromDOM,
  type ParsedCalendar,
} from "@/features/tournamentImport/parseCalendarMatchesFromDOM";
import {
  inferSeasonLabelFromDoc,
  parseDateTextToISO,
} from "@/features/tournamentImport/dateUtils";
import { sha1Hex, stableKeyForMatch } from "@/features/tournamentImport/hashUtils";
import { fetchAndParseAllTabs } from "@/features/tournamentImport/multiTabFetch";
import { inferBaseTournamentUrl } from "@/features/tournamentImport/v9kyUrl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type LoadState = "idle" | "loading" | "ready" | "error";

type CopyError = {
  key: string;
  message: string;
} | null;

type RunMeta = Pick<ImportRunSummary, "run_id" | "snapshot_file" | "parsed_at">;

type Coverage = {
  tab_labels: string[];
  matches_per_tab: Record<string, number>;
  tabs_found: number;
  raw_matches: number;
  fetched_tabs: number;
  skipped_tabs: number;
  fetch_errors: Array<{ tab_label: string; url: string; error: string }>;
};

type ProgressState = {
  current: number;
  total: number;
  tab_label: string;
} | null;

const STANDINGS_LABEL = "Турнірна таблиця";
const MATCHES_LABEL = "Календар матчів";
const SNAPSHOT_FILE = "/snapshots/v9ky-gold-league.html";
const TOURNAMENT_URL =
  "https://v9ky.in.ua/2025-26_Zyma_Kyiv_Gold_League_Futsal?first_day=2025-12-27&last_day=0";

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

function normalizeMatches(
  matches: MatchItem[],
  seasonLabel: string | null,
): Promise<MatchItem[]> {
  return Promise.all(
    matches.map(async (match) => {
      const start_at = parseDateTextToISO(match.date_text, match.time, seasonLabel);
      const key = stableKeyForMatch({
        start_at,
        home_team: match.home_team,
        away_team: match.away_team,
        league_round_venue: match.league_round_venue,
        tab_label: match.tab_label,
      });
      const external_match_id = await sha1Hex(key);

      return {
        ...match,
        start_at,
        season_label: seasonLabel,
        external_match_id,
      };
    }),
  );
}

function buildCoverage(tabLabels: string[], matches: MatchItem[], rawMatches: number): Coverage {
  const matchesPerTab: Record<string, number> = {};
  for (const match of matches) {
    const key = match.tab_label ?? "unknown";
    matchesPerTab[key] = (matchesPerTab[key] ?? 0) + 1;
  }

  return {
    tab_labels: tabLabels,
    matches_per_tab: matchesPerTab,
    tabs_found: tabLabels.length,
    raw_matches: rawMatches,
    fetched_tabs: 0,
    skipped_tabs: 0,
    fetch_errors: [],
  };
}

function buildCoverageFromTabs(
  tabs: Array<{ label: string; matches_count: number; skipped: boolean; error: string | null; url: string | null }>,
): Coverage {
  const matchesPerTab: Record<string, number> = {};
  const tabLabels = tabs.map((tab) => tab.label);
  const fetchErrors = tabs
    .filter((tab) => tab.error && tab.url)
    .map((tab) => ({
      tab_label: tab.label,
      url: tab.url ?? "",
      error: tab.error ?? "",
    }));

  for (const tab of tabs) {
    matchesPerTab[tab.label] = tab.matches_count;
  }

  return {
    tab_labels: tabLabels,
    matches_per_tab: matchesPerTab,
    tabs_found: tabs.length,
    raw_matches: tabs.reduce((sum, tab) => sum + tab.matches_count, 0),
    fetched_tabs: tabs.filter((tab) => tab.url && !tab.error && !tab.skipped).length,
    skipped_tabs: tabs.filter((tab) => tab.skipped).length,
    fetch_errors: fetchErrors,
  };
}

export default function TournamentImportLabPage() {
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<CopyError>(null);
  const [rawHtml, setRawHtml] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedTournamentData | null>(null);
  const [coverage, setCoverage] = useState<Coverage>({
    tab_labels: [],
    matches_per_tab: {},
    tabs_found: 0,
    raw_matches: 0,
    fetched_tabs: 0,
    skipped_tabs: 0,
    fetch_errors: [],
  });
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [ourTeamQuery, setOurTeamQuery] = useState<string>("FAYNA");
  const [onlyOurTeam, setOnlyOurTeam] = useState<boolean>(false);
  const [parserMode, setParserMode] = useState<ParserMode>("dom");
  const [progress, setProgress] = useState<ProgressState>(null);
  const [isFetchingTabs, setIsFetchingTabs] = useState(false);
  const [fetchAborted, setFetchAborted] = useState(false);
  const [multiWarnings, setMultiWarnings] = useState<Array<{ type: string; message: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);

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
      setRawHtml(html);
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

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsFetchingTabs(false);
    setProgress(null);
    setFetchAborted(true);
  };

  const snapshotDoc = useMemo(() => {
    if (!rawHtml) return null;
    return parseHtmlToDocument(rawHtml);
  }, [rawHtml]);

  const normalizedText = useMemo(() => {
    if (!snapshotDoc) return "";
    return normalizeSpace(snapshotDoc.body.textContent ?? "");
  }, [snapshotDoc]);

  const { standingsBlock, matchesBlock } = useMemo(() => {
    if (!normalizedText) {
      return { standingsBlock: null, matchesBlock: null };
    }
    return {
      standingsBlock: extractBlock(normalizedText, STANDINGS_LABEL, MATCHES_LABEL),
      matchesBlock: extractBlock(normalizedText, MATCHES_LABEL),
    };
  }, [normalizedText]);

  useEffect(() => {
    if (!snapshotDoc) {
      setParsed(null);
      setSeasonLabel(null);
      setMultiWarnings([]);
      setCoverage({
        tab_labels: [],
        matches_per_tab: {},
        tabs_found: 0,
        raw_matches: 0,
        fetched_tabs: 0,
        skipped_tabs: 0,
        fetch_errors: [],
      });
      return;
    }

    let cancelled = false;
    const baseSeason = inferSeasonLabelFromDoc(snapshotDoc, TOURNAMENT_URL);

    const parseAsync = async () => {
      if (parserMode === "dom_all_tabs") {
        setIsFetchingTabs(true);
        setFetchAborted(false);
        setMultiWarnings([]);
        const controller = new AbortController();
        abortRef.current = controller;
        setProgress(null);

        const standings = parseStandingsFromDOM(snapshotDoc);
        const result = await fetchAndParseAllTabs({
          tournamentUrl: TOURNAMENT_URL,
          seasonLabel: baseSeason,
          docWithTabs: snapshotDoc,
          ourTeamQuery,
          rateLimitMs: 200,
          signal: controller.signal,
          onProgress: (p) => {
            if (cancelled) return;
            setProgress(p);
          },
        });

        if (cancelled) return;

        setParsed({ standings, matches: result.merged_matches });
        setSeasonLabel(result.season_label);
        setCoverage(buildCoverageFromTabs(result.tabs));
        setMultiWarnings(result.warnings);
        setIsFetchingTabs(false);
        setProgress(null);
        return;
      }

      let standings = parseStandingsFromText(normalizedText);
      let calendar: ParsedCalendar = { tab_labels: [], matches: [], raw_matches: 0 };

      if (parserMode === "dom") {
        standings = parseStandingsFromDOM(snapshotDoc);
        calendar = parseCalendarMatchesFromDOM(snapshotDoc);
      } else {
        const matches = parseCalendarMatchesFromText(normalizedText);
        calendar = {
          tab_labels: [],
          matches,
          raw_matches: matches.length,
        };
      }

      const normalizedMatches = await normalizeMatches(calendar.matches, baseSeason);

      if (cancelled) return;

      setSeasonLabel(baseSeason);
      setCoverage(buildCoverage(calendar.tab_labels, normalizedMatches, calendar.raw_matches));
      setParsed({ standings, matches: normalizedMatches });
      setMultiWarnings([]);
    };

    void parseAsync().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setState("error");
      setIsFetchingTabs(false);
      setProgress(null);
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [normalizedText, parserMode, snapshotDoc, ourTeamQuery]);

  const filteredMatches = useMemo(() => {
    if (!parsed) return [] as MatchItem[];
    if (!onlyOurTeam) return parsed.matches;
    return parsed.matches.filter((match) => matchesOurTeam(match, ourTeamQuery));
  }, [onlyOurTeam, ourTeamQuery, parsed]);

  const ourTeamMatchesCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.matches.filter((match) => matchesOurTeam(match, ourTeamQuery)).length;
  }, [parsed, ourTeamQuery]);

  const warnings = useMemo(() => {
    const entries: Array<{ type: string; message: string }> = [];
    if (!parsed) return entries;

    if (coverage.tabs_found >= 6 && parsed.matches.length <= 5) {
      entries.push({
        type: "coverage",
        message: "Looks like only the active tab was parsed.",
      });
    }

    const missingDates = parsed.matches.filter((match) => !match.start_at).length;
    if (missingDates > 0) {
      entries.push({
        type: "dates",
        message: `${missingDates} matches could not be normalized to start_at.`,
      });
    }

    const dedupRemoved = Math.max(coverage.raw_matches - parsed.matches.length, 0);
    if (coverage.raw_matches >= 5 && dedupRemoved >= 3 && dedupRemoved / coverage.raw_matches >= 0.2) {
      entries.push({
        type: "dedupe",
        message: `Dedup removed ${dedupRemoved} of ${coverage.raw_matches} match candidates.`,
      });
    }

    if (coverage.skipped_tabs > 0) {
      entries.push({
        type: "tabs",
        message: `Skipped ${coverage.skipped_tabs} tabs due to missing date windows.`,
      });
    }

    if (coverage.fetch_errors.length > 0) {
      entries.push({
        type: "fetch",
        message: `Fetch errors on ${coverage.fetch_errors.length} tabs.`,
      });
    }

    if (fetchAborted) {
      entries.push({
        type: "fetch",
        message: "Fetch aborted.",
      });
    }

    if (multiWarnings.length > 0) {
      entries.push(...multiWarnings);
    }

    if (state === "ready" && !isFetchingTabs && abortRef.current === null && parserMode === "dom_all_tabs") {
      if (progress === null && coverage.fetched_tabs === 0 && coverage.fetch_errors.length === 0) {
        entries.push({
          type: "fetch",
          message: "No tabs were fetched.",
        });
      }
    }

    return entries;
  }, [
    coverage.fetch_errors.length,
    coverage.raw_matches,
    coverage.skipped_tabs,
    coverage.tabs_found,
    coverage.fetched_tabs,
    fetchAborted,
    isFetchingTabs,
    multiWarnings,
    parsed,
    parserMode,
    progress,
    state,
  ]);

  const runSummary = useMemo<ImportRunSummary | null>(() => {
    if (!runMeta || !parsed) return null;
    return {
      run_id: runMeta.run_id,
      snapshot_file: runMeta.snapshot_file,
      parsed_at: runMeta.parsed_at,
      parser_mode: parserMode,
      standings_rows: parsed.standings.rows.length,
      tabs_found: coverage.tabs_found,
      tab_labels: coverage.tab_labels,
      matches_per_tab: coverage.matches_per_tab,
      matches_found: parsed.matches.length,
      our_team_matches: ourTeamMatchesCount,
      season_label: seasonLabel,
      warnings,
      fetched_tabs: coverage.fetched_tabs,
      skipped_tabs: coverage.skipped_tabs,
      fetch_errors: coverage.fetch_errors,
      progress: {
        current: progress?.current ?? 0,
        total: progress?.total ?? 0,
      },
      filters: {
        our_team_query: ourTeamQuery,
        only_our_team: onlyOurTeam,
      },
    };
  }, [
    coverage.fetch_errors,
    coverage.matches_per_tab,
    coverage.skipped_tabs,
    coverage.tab_labels,
    coverage.tabs_found,
    coverage.fetched_tabs,
    onlyOurTeam,
    ourTeamMatchesCount,
    ourTeamQuery,
    parsed,
    parserMode,
    progress,
    runMeta,
    seasonLabel,
    warnings,
  ]);

  const summaryLine = useMemo(() => {
    if (!runSummary) return null;
    const shortId = runSummary.run_id.slice(0, 8);
    const parsedAt = new Date(runSummary.parsed_at).toLocaleString("uk-UA", {
      hour12: false,
    });
    const modeLabel =
      runSummary.parser_mode === "dom_all_tabs"
        ? "DOM all tabs"
        : runSummary.parser_mode === "dom"
          ? "DOM"
          : "Text";
    return `Run: ${shortId} • Parsed: ${parsedAt} • Mode: ${modeLabel} • Standings: ${runSummary.standings_rows} • Matches: ${runSummary.matches_found} • Our team: ${runSummary.our_team_matches}`;
  }, [runSummary]);

  const coverageLine = useMemo(() => {
    if (!runSummary) return null;
    const unknown = coverage.matches_per_tab.unknown ?? 0;
    return `Tabs: ${runSummary.tabs_found} • Fetched: ${coverage.fetched_tabs} • Skipped: ${coverage.skipped_tabs} • Matches: ${runSummary.matches_found} • Unknown-tab: ${unknown} • Season: ${runSummary.season_label ?? "—"}`;
  }, [coverage.fetched_tabs, coverage.matches_per_tab.unknown, coverage.skipped_tabs, runSummary]);

  const progressLine = useMemo(() => {
    if (!progress) return null;
    return `Fetching tab ${progress.current}/${progress.total}: ${progress.tab_label}`;
  }, [progress]);

  const standingsJson = useMemo(() => {
    if (!parsed) return "";
    return JSON.stringify(parsed.standings, null, 2);
  }, [parsed]);

  const matchesJson = useMemo(() => {
    if (!parsed) return "";
    return JSON.stringify(
      {
        parser_mode: parserMode,
        season_label: seasonLabel,
        base_url: inferBaseTournamentUrl(TOURNAMENT_URL),
        tabs_found: coverage.tabs_found,
        tab_labels: coverage.tab_labels,
        matches_per_tab: coverage.matches_per_tab,
        fetched_tabs: coverage.fetched_tabs,
        skipped_tabs: coverage.skipped_tabs,
        fetch_errors: coverage.fetch_errors,
        matches: parsed.matches,
        filtered_matches: filteredMatches,
        warnings,
      },
      null,
      2,
    );
  }, [
    coverage.fetch_errors,
    coverage.matches_per_tab,
    coverage.tab_labels,
    coverage.tabs_found,
    coverage.fetched_tabs,
    coverage.skipped_tabs,
    filteredMatches,
    parsed,
    parserMode,
    seasonLabel,
    warnings,
  ]);

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

      <div className="flex flex-col gap-4 rounded-[var(--radius-inner)] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleLoad}
            disabled={state === "loading" || isFetchingTabs}
          >
            {state === "loading" ? "Завантаження..." : "Завантажити snapshot"}
          </Button>
          {isFetchingTabs ? (
            <Button type="button" variant="outline" size="sm" onClick={handleStop}>
              Stop
            </Button>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {state === "idle" && "Очікує на завантаження"}
            {state === "ready" && "Snapshot готовий"}
            {state === "error" && "Помилка під час завантаження"}
          </div>
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>

        {progressLine ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {progressLine}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-foreground">
            <span className="text-xs font-semibold text-muted-foreground">Наша команда (фільтр)</span>
            <Input
              value={ourTeamQuery}
              onChange={(event) => setOurTeamQuery(event.target.value)}
              className="h-9 text-sm"
              type="text"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={onlyOurTeam}
              onCheckedChange={(value) => setOnlyOurTeam(Boolean(value))}
            />
            <span>Показувати тільки матчі нашої команди</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-foreground">
          <span className="text-xs font-semibold text-muted-foreground">Parser mode</span>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="parser-mode"
              value="dom"
              checked={parserMode === "dom"}
              onChange={() => setParserMode("dom")}
              className="h-4 w-4 rounded-[var(--radius)] border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span>DOM (accurate)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="parser-mode"
              value="dom_all_tabs"
              checked={parserMode === "dom_all_tabs"}
              onChange={() => setParserMode("dom_all_tabs")}
              className="h-4 w-4 rounded-[var(--radius)] border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span>DOM — ALL TABS (multi-fetch)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="parser-mode"
              value="text"
              checked={parserMode === "text"}
              onChange={() => setParserMode("text")}
              className="h-4 w-4 rounded-[var(--radius)] border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <span>Text (prototype)</span>
          </label>
        </div>

        {summaryLine ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {summaryLine}
          </div>
        ) : null}
        {coverageLine ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {coverageLine}
          </div>
        ) : null}
      </div>

      <section className="rounded-[var(--radius-inner)] border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Coverage</h2>
          <span className="text-xs text-muted-foreground">{coverage.tabs_found} tabs</span>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
          {coverage.tab_labels.length === 0 ? (
            <span>Tab labels not detected.</span>
          ) : (
            coverage.tab_labels.map((label) => (
              <div key={label} className="flex items-center justify-between rounded-[var(--radius-md)] bg-muted/50 px-2 py-1">
                <span>{label}</span>
                <span>{coverage.matches_per_tab[label] ?? 0}</span>
              </div>
            ))
          )}
          {coverage.matches_per_tab.unknown ? (
            <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-muted/50 px-2 py-1">
              <span>Unknown</span>
              <span>{coverage.matches_per_tab.unknown}</span>
            </div>
          ) : null}
        </div>
        {coverage.fetch_errors.length > 0 ? (
          <div className="mt-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {coverage.fetch_errors.map((item) => (
              <div key={`${item.tab_label}-${item.url}`}>{item.tab_label}: {item.error}</div>
            ))}
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {warnings.map((warning) => (
              <div key={warning.type}>{warning.message}</div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[var(--radius-inner)] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Standings block</h2>
            <span className="text-xs text-muted-foreground">{standingsBlock?.length ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(standingsBlock)}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Parsed standings JSON</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleCopy("standings", standingsJson || "{}")}
              disabled={!standingsJson}
            >
              Скопіювати JSON
            </Button>
          </div>
          {copyError?.key === "standings" ? (
            <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
          ) : null}
          <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-md)] bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {standingsJson || "{}"}
          </pre>
        </section>

        <section className="rounded-[var(--radius-inner)] border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Calendar matches block</h2>
            <span className="text-xs text-muted-foreground">{matchesBlock?.length ?? 0} chars</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{toPreview(matchesBlock)}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Export JSON · {filteredMatches.length} shown
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleCopy("matches", matchesJson || "{}")}
              disabled={!matchesJson}
            >
              Скопіювати JSON
            </Button>
          </div>
          {copyError?.key === "matches" ? (
            <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
          ) : null}
          <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-md)] bg-muted/60 p-3 text-[11px] text-muted-foreground">
            {matchesJson || "{}"}
          </pre>
        </section>
      </div>

      <section className="rounded-[var(--radius-inner)] border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Run summary</h2>
          <span className="text-xs text-muted-foreground">{normalizedText.length} chars</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">ImportRunSummary JSON</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => handleCopy("summary", summaryJson || "{}")}
            disabled={!summaryJson}
          >
            Скопіювати JSON
          </Button>
        </div>
        {copyError?.key === "summary" ? (
          <div className="mt-2 text-xs text-destructive">{copyError.message}</div>
        ) : null}
        <pre className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-md)] bg-muted/60 p-3 text-[11px] text-muted-foreground">
          {summaryJson || "{}"}
        </pre>
      </section>
    </div>
  );
}
