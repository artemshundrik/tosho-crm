import { parseHtmlToDocument } from "./domUtils";
import { parseDateTextToISO } from "./dateUtils";
import { fetchHtml, sleep } from "./fetchHtml";
import { sha1Hex, stableKeyForMatch } from "./hashUtils";
import { parseCalendarMatchesFromDOM } from "./parseCalendarMatchesFromDOM";
import type { MatchItem } from "./types";
import { buildV9kyTabUrl, extractTabsFromDoc, inferBaseTournamentUrl } from "./v9kyUrl";

export type MultiTabResult = {
  season_label: string | null;
  tabs: {
    label: string;
    url: string | null;
    matches_count: number;
    skipped: boolean;
    error: string | null;
  }[];
  merged_matches: MatchItem[];
  warnings: Array<{ type: string; message: string }>;
};

type ProgressPayload = { current: number; total: number; tab_label: string };

type FetchArgs = {
  tournamentUrl: string;
  seasonLabel: string | null;
  docWithTabs: Document;
  ourTeamQuery: string;
  rateLimitMs?: number;
  onProgress?: (p: ProgressPayload) => void;
  signal?: AbortSignal;
};

function dedupeByExternalId(matches: MatchItem[]) {
  const seen = new Map<string, MatchItem>();
  for (const match of matches) {
    const existing = seen.get(match.external_match_id);
    if (!existing) {
      seen.set(match.external_match_id, match);
      continue;
    }
    if (!existing.start_at && match.start_at) {
      seen.set(match.external_match_id, match);
    }
  }
  return Array.from(seen.values());
}

export async function fetchAndParseAllTabs(args: FetchArgs): Promise<MultiTabResult> {
  const {
    tournamentUrl,
    seasonLabel,
    docWithTabs,
    rateLimitMs = 200,
    onProgress,
    signal,
  } = args;

  const baseUrl = inferBaseTournamentUrl(tournamentUrl);
  const { tabs, raw_labels } = extractTabsFromDoc(docWithTabs);

  const warnings: Array<{ type: string; message: string }> = [];
  const results: MultiTabResult["tabs"] = [];
  const allMatches: MatchItem[] = [];

  const total = tabs.length;
  let current = 0;

  for (const tab of tabs) {
    current += 1;
    onProgress?.({ current, total, tab_label: tab.label });

    if (!tab.first_day) {
      results.push({
        label: tab.label,
        url: null,
        matches_count: 0,
        skipped: true,
        error: "Tab label could not be converted to dates",
      });
      continue;
    }

    const url = buildV9kyTabUrl(baseUrl, tab);
    try {
      const html = await fetchHtml(url, signal);
      const doc = parseHtmlToDocument(html);
      const calendar = parseCalendarMatchesFromDOM(doc);

      const normalized = await Promise.all(
        calendar.matches.map(async (match) => {
          const start_at = parseDateTextToISO(match.date_text, match.time, seasonLabel);
          const key = stableKeyForMatch({
            start_at,
            home_team: match.home_team,
            away_team: match.away_team,
            league_round_venue: match.league_round_venue,
            tab_label: tab.label,
          });
          const external_match_id = await sha1Hex(key);
          return {
            ...match,
            tab_label: tab.label,
            start_at,
            season_label: seasonLabel,
            external_match_id,
          };
        }),
      );

      allMatches.push(...normalized);
      results.push({
        label: tab.label,
        url,
        matches_count: normalized.length,
        skipped: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        label: tab.label,
        url,
        matches_count: 0,
        skipped: false,
        error: message,
      });
    }

    if (rateLimitMs > 0) {
      await sleep(rateLimitMs);
    }
  }

  const merged = dedupeByExternalId(allMatches);

  const fetchedTabs = results.filter((tab) => tab.url && !tab.error).length;
  const skippedTabs = results.filter((tab) => tab.skipped).length;
  const erroredTabs = results.filter((tab) => tab.error && !tab.skipped).length;

  if (fetchedTabs >= 6 && merged.length < fetchedTabs) {
    warnings.push({
      type: "coverage",
      message: "Low match yield compared to tabs fetched.",
    });
  }

  if (skippedTabs > 0) {
    warnings.push({
      type: "tabs",
      message: `Skipped ${skippedTabs} tabs due to unparsed dates (${raw_labels.length} labels total).`,
    });
  }

  if (erroredTabs > 0) {
    warnings.push({
      type: "fetch",
      message: `Fetch errors on ${erroredTabs} tabs.`,
    });
  }

  return {
    season_label: seasonLabel,
    tabs: results,
    merged_matches: merged,
    warnings,
  };
}
