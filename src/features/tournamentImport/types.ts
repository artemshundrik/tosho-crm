export type StandingRow = {
  position: number;
  team: string;
  played: number | null;
  points: number | null;
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
};

export type ParsedTournamentData = {
  standings: ParsedStandings;
  matches: MatchItem[];
};

export type ImportRunSummary = {
  run_id: string;
  snapshot_file: string;
  parsed_at: string;
  standings_rows: number;
  matches_found: number;
  our_team_matches: number;
  filters: {
    our_team_query: string;
    only_our_team: boolean;
  };
};
