export interface League {
  leagueid: number;
  ticket: string;
  banner: string;
  tier: string;
  name: string;
  start_timestamp?: number;
  end_timestamp?: number;
}

export interface LeagueMatch {
  match_id: number;
  duration: number;
  start_time: number;
  radiant_team_id: number;
  dire_team_id: number;
  radiant_team_name: string;
  dire_team_name: string;
  leagueid: number;
  series_id: number;
  series_type: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
}

export interface PickBan {
  is_pick: boolean;
  hero_id: number;
  team: number; // 0 = radiant, 1 = dire
  order: number;
  match_id?: number;
}

export interface PlayerMatch {
  account_id: number;
  player_slot: number; // 0-4 radiant, 128-132 dire
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  denies: number;
  level?: number;
  net_worth?: number;
  hero_damage?: number;
  tower_damage?: number;
  hero_healing?: number;
  obs_placed?: number;
  sen_placed?: number;
  personaname?: string;
  name?: string;
  // End-game items
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  item_neutral?: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
}

export interface MatchObjective {
  time: number;
  type: string;
  team: number; // 2 = radiant, 3 = dire
  key?: string;
  unit?: string;
  slot?: number;
}

export interface MatchDetail {
  match_id: number;
  duration: number;
  start_time: number;
  radiant_team_id: number;
  dire_team_id: number;
  radiant_name: string;
  dire_name: string;
  leagueid: number;
  series_id: number;
  series_type: number;
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  picks_bans: PickBan[];
  players: PlayerMatch[];
  objectives?: MatchObjective[];
  patch?: number;
  game_mode?: number;
  radiant_gold_adv?: number[];
  radiant_xp_adv?: number[];
  cluster?: number;
}

export interface Hero {
  id: number;
  name: string;
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  roles: string[];
  img?: string;
  icon?: string;
}

export interface HeroConstants {
  [id: string]: {
    id: number;
    name: string;
    localized_name: string;
    primary_attr: string;
    attack_type: string;
    roles: string[];
    img: string;
    icon: string;
  };
}

export interface ItemConstant {
  id: number;
  img: string;
  dname: string;
  qual?: string;
  cost?: number;
}

export interface ItemConstants {
  [name: string]: ItemConstant;
}

export interface PatchConstant {
  name: string;
  date: string; // unix timestamp as string
}

export interface ProHeroStat {
  id: number;
  name: string;
  localized_name: string;
  primary_attr: string;
  attack_type: string;
  roles: string[];
  pro_pick: number;
  pro_ban: number;
  pro_win: number;
  pro_loss?: number;
  img?: string;
  icon?: string;
}

export interface Team {
  team_id: number;
  rating: number;
  wins: number;
  losses: number;
  last_match_time: number;
  name: string;
  tag: string;
  logo_url?: string;
}

export interface TeamMatch {
  match_id: number;
  radiant_win: boolean;
  radiant: boolean;
  duration: number;
  start_time: number;
  leagueid: number;
  league_name?: string;
  opposing_team_id: number;
  opposing_team_name: string;
  opposing_team_logo?: string;
  cluster?: number;
}

export interface HeroStats {
  hero_id: number;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  win_rate: number;
  pick_rate: number;
  ban_rate: number;
  presence: number;
}

export interface TeamTournamentStats {
  team_id: number;
  team_name: string;
  logo_url?: string;
  wins: number;
  losses: number;
  win_rate: number;
  radiant_wins: number;
  radiant_losses: number;
  dire_wins: number;
  dire_losses: number;
  radiant_win_rate: number;
  dire_win_rate: number;
  first_pick_wins: number;
  first_pick_losses: number;
  first_pick_win_rate: number;
  second_pick_wins: number;
  second_pick_losses: number;
  second_pick_win_rate: number;
}

export interface UpcomingMatch {
  timestamp: number;
  team1: string;
  team2: string;
  bestof: number;
  tournament: string;
}

export interface LiveMatch {
  match_id: string;
  league_id: number;
  team_name_radiant: string;
  team_name_dire: string;
  game_time: number;
  radiant_score: number;
  dire_score: number;
  radiant_lead: number;
  spectators: number;
}

export type DateRanges = Record<number, { first: number; last: number }>;

export interface ExplorerResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface PlayerTournamentStats {
  account_id: number;
  personaname: string;
  name?: string;
  team_name?: string;
  games: number;
  wins: number;
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_kda: number;
  avg_gpm: number;
  avg_xpm: number;
}
