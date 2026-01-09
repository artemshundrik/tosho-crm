export type StandingRow = {
  position: number;
  team: string;
  logo_url?: string | null;
  played: number | null;
  points: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
};

export type ParsedStandings = {
  title: string | null;
  rows: StandingRow[];
};

export type MatchItem = {
  date_text: string;
  time: string;
  home_team: string;
  away_team: string;
  league_round_venue: string;
  status: string | null;
  start_at: string | null;
  season_label: string | null;
  tab_label: string | null;
  external_match_id: string;
};

export type ParsedTournamentData = {
  standings: ParsedStandings;
  matches: MatchItem[];
};

export type ParserMode = "text" | "dom" | "dom_all_tabs";

export type ImportRunSummary = {
  run_id: string;
  snapshot_file: string;
  parsed_at: string;
  parser_mode: ParserMode;
  standings_rows: number;
  tabs_found: number;
  tab_labels: string[];
  matches_per_tab: Record<string, number>;
  matches_found: number;
  our_team_matches: number;
  season_label: string | null;
  warnings: Array<{ type: string; message: string }>;
  fetched_tabs: number;
  skipped_tabs: number;
  fetch_errors: Array<{ tab_label: string; url: string; error: string }>;
  progress: { current: number; total: number };
  filters: {
    our_team_query: string;
    only_our_team: boolean;
  };
};
