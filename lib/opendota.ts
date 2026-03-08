import {
  League,
  LeagueMatch,
  MatchDetail,
  HeroConstants,
  ItemConstants,
  PatchConstant,
  ProHeroStat,
  Team,
  TeamMatch,
  ExplorerResult,
} from './types';

const BASE_URL = 'https://api.opendota.com/api';

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OpenDota API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Keywords that identify Tier 1 events regardless of OpenDota's tier classification
const T1_KEYWORDS = [
  'dreamleague',
  'esl one',
  'pgl wallachia',
  'wallachia season',
  'the international',
  'riyadh masters',
  'fissure playground',
  'esports world cup',
  'blast slam',
  'lima major',
  'berlin major',
  'bali major',
  'starladder major',
  'weplay major',
  'epicenter major',
];

// Qualifier / minor event patterns — excluded regardless of tier
const QUAL_EXCLUDES = [' qualifier', ' oq', ' cq', 'open qualifier', 'closed qualifier', 'regional qualifier'];

export async function getLeagues(): Promise<League[]> {
  const leagues = await fetchAPI<League[]>('/leagues');
  return leagues.filter((l) => {
    if (l.tier === 'excluded') return false;
    const nameLower = l.name.toLowerCase();
    if (QUAL_EXCLUDES.some((kw) => nameLower.includes(kw))) return false;
    if (/ qual\b/.test(nameLower)) return false;
    if (l.tier === 'premium') return true;
    return T1_KEYWORDS.some((kw) => nameLower.includes(kw));
  });
}

export async function getLeague(leagueid: number): Promise<League> {
  return fetchAPI<League>(`/leagues/${leagueid}`);
}

export async function getLeagueMatches(leagueid: number): Promise<LeagueMatch[]> {
  return fetchAPI<LeagueMatch[]>(`/leagues/${leagueid}/matches`);
}

export async function getLeagueTeams(leagueid: number): Promise<Team[]> {
  return fetchAPI<Team[]>(`/leagues/${leagueid}/teams`);
}

export async function getMatch(matchId: number): Promise<MatchDetail> {
  return fetchAPI<MatchDetail>(`/matches/${matchId}`);
}

export async function getHeroConstants(): Promise<HeroConstants> {
  return fetchAPI<HeroConstants>('/constants/heroes');
}

export async function getItemConstants(): Promise<ItemConstants> {
  return fetchAPI<ItemConstants>('/constants/items');
}

export async function getPatchConstants(): Promise<PatchConstant[]> {
  return fetchAPI<PatchConstant[]>('/constants/patch');
}

export async function getProHeroStats(): Promise<ProHeroStat[]> {
  return fetchAPI<ProHeroStat[]>('/heroStats');
}

export async function getAllTeams(): Promise<Team[]> {
  return fetchAPI<Team[]>('/teams');
}

export async function getTeam(teamId: number): Promise<Team> {
  return fetchAPI<Team>(`/teams/${teamId}`);
}

export async function getTeamMatches(teamId: number): Promise<TeamMatch[]> {
  return fetchAPI<TeamMatch[]>(`/teams/${teamId}/matches`);
}

export async function getTeamHeroes(teamId: number) {
  return fetchAPI(`/teams/${teamId}/heroes`);
}

export async function getTeamPlayers(teamId: number) {
  return fetchAPI(`/teams/${teamId}/players`);
}

export async function explorerQuery(sql: string): Promise<ExplorerResult> {
  const encoded = encodeURIComponent(sql);
  return fetchAPI<ExplorerResult>(`/explorer?sql=${encoded}`);
}

export async function getLeagueDateRanges(): Promise<Record<number, { first: number; last: number }>> {
  const sql = `
    SELECT leagueid, MIN(start_time) AS first_match, MAX(start_time) AS last_match
    FROM matches
    WHERE start_time > 1700000000
    GROUP BY leagueid
  `;
  const result = await explorerQuery(sql);
  const map: Record<number, { first: number; last: number }> = {};
  for (const row of result.rows) {
    const id = row.leagueid as number;
    if (id) map[id] = { first: row.first_match as number, last: row.last_match as number };
  }
  return map;
}

export async function getTeamRecentPlayers(
  teamId: number
): Promise<{ account_id: number; games: number }[]> {
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
  const sql = `
    SELECT pm.account_id, COUNT(*) AS games
    FROM player_matches pm
    JOIN matches m ON pm.match_id = m.match_id
    WHERE (m.radiant_team_id = ${teamId} OR m.dire_team_id = ${teamId})
      AND m.start_time > ${ninetyDaysAgo}
      AND pm.account_id IS NOT NULL
      AND pm.account_id != 4294967295
    GROUP BY pm.account_id
    ORDER BY games DESC
    LIMIT 15
  `;
  const result = await explorerQuery(sql);
  return result.rows.map((r: Record<string, unknown>) => ({
    account_id: r.account_id as number,
    games: r.games as number,
  }));
}

export async function getLeaguePicksBans(leagueid: number): Promise<ExplorerResult> {
  const sql = `
    SELECT pb.match_id, pb.hero_id, pb.is_pick, pb.team, pb.order, m.radiant_win,
           m.radiant_team_id, m.dire_team_id, m.start_time
    FROM picks_bans pb
    JOIN matches m ON pb.match_id = m.match_id
    WHERE m.leagueid = ${leagueid}
    ORDER BY m.start_time DESC, pb.order ASC
  `;
  return explorerQuery(sql);
}

export async function getLeaguePlayerStats(leagueid: number): Promise<ExplorerResult> {
  const sql = `
    SELECT pm.match_id, pm.account_id, pm.hero_id, pm.kills, pm.deaths, pm.assists,
           pm.gold_per_min, pm.xp_per_min, pm.last_hits, pm.denies,
           pm.net_worth, pm.hero_damage, pm.tower_damage, pm.player_slot,
           m.radiant_win, m.start_time, m.radiant_team_id, m.dire_team_id
    FROM player_matches pm
    JOIN matches m ON pm.match_id = m.match_id
    WHERE m.leagueid = ${leagueid}
    AND pm.account_id != 4294967295
    ORDER BY m.start_time DESC
  `;
  return explorerQuery(sql);
}

// Build reverse map: item_id -> { name, dname, img }
export function buildItemIdMap(
  constants: ItemConstants
): Record<number, { name: string; dname: string }> {
  const map: Record<number, { name: string; dname: string }> = {};
  for (const [name, item] of Object.entries(constants)) {
    if (item.id) {
      map[item.id] = { name, dname: item.dname };
    }
  }
  return map;
}

// Compute patch name from match start_time
export function getMatchPatch(
  startTime: number,
  patches: PatchConstant[]
): string {
  const sorted = [...patches].sort((a, b) => Number(b.date) - Number(a.date));
  for (const patch of sorted) {
    if (startTime >= Number(patch.date)) {
      return patch.name;
    }
  }
  return patches[0]?.name || 'unknown';
}

export function getHeroImageUrl(heroName: string): string {
  const name = heroName.replace('npc_dota_hero_', '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${name}.png`;
}

export function getHeroPortraitUrl(heroName: string): string {
  const name = heroName.replace('npc_dota_hero_', '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/${name}_full.png`;
}

export function getTeamLogoUrl(teamId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/team_logos/${teamId}.png`;
}

export function getItemImageUrl(itemName: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${itemName}.png`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
