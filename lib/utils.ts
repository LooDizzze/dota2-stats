import { MatchDetail, HeroStats, TeamTournamentStats, HeroConstants, LeagueMatch } from './types';

export function computeHeroStats(
  matches: MatchDetail[],
  totalMatches: number
): HeroStats[] {
  const heroMap: Record<number, HeroStats> = {};

  for (const match of matches) {
    if (!match.picks_bans) continue;

    for (const pb of match.picks_bans) {
      if (!heroMap[pb.hero_id]) {
        heroMap[pb.hero_id] = {
          hero_id: pb.hero_id,
          picks: 0,
          bans: 0,
          wins: 0,
          losses: 0,
          win_rate: 0,
          pick_rate: 0,
          ban_rate: 0,
          presence: 0,
        };
      }

      const hero = heroMap[pb.hero_id];

      if (pb.is_pick) {
        hero.picks++;
        const pickerWon =
          (pb.team === 0 && match.radiant_win) ||
          (pb.team === 1 && !match.radiant_win);
        if (pickerWon) hero.wins++;
        else hero.losses++;
      } else {
        hero.bans++;
      }
    }
  }

  const total = totalMatches || matches.length;

  return Object.values(heroMap).map((h) => ({
    ...h,
    win_rate: h.picks > 0 ? (h.wins / h.picks) * 100 : 0,
    pick_rate: (h.picks / total) * 100,
    ban_rate: (h.bans / total) * 100,
    presence: ((h.picks + h.bans) / total) * 100,
  }));
}

export function computeHeroStatsFromExplorer(
  rows: Record<string, unknown>[],
  totalMatches: number
): HeroStats[] {
  const heroMap: Record<number, HeroStats> = {};

  for (const row of rows) {
    const heroId = Number(row.hero_id);
    const isPick = Boolean(row.is_pick);
    const team = Number(row.team);
    const radiantWin = Boolean(row.radiant_win);

    if (!heroMap[heroId]) {
      heroMap[heroId] = {
        hero_id: heroId,
        picks: 0,
        bans: 0,
        wins: 0,
        losses: 0,
        win_rate: 0,
        pick_rate: 0,
        ban_rate: 0,
        presence: 0,
      };
    }

    const hero = heroMap[heroId];

    if (isPick) {
      hero.picks++;
      const pickerWon = (team === 0 && radiantWin) || (team === 1 && !radiantWin);
      if (pickerWon) hero.wins++;
      else hero.losses++;
    } else {
      hero.bans++;
    }
  }

  return Object.values(heroMap).map((h) => ({
    ...h,
    win_rate: h.picks > 0 ? (h.wins / h.picks) * 100 : 0,
    pick_rate: (h.picks / totalMatches) * 100,
    ban_rate: (h.bans / totalMatches) * 100,
    presence: ((h.picks + h.bans) / totalMatches) * 100,
  }));
}

export function computeTeamStats(
  matches: LeagueMatch[],
  picksBansRows: Record<string, unknown>[]
): TeamTournamentStats[] {
  const teamMap: Record<number, TeamTournamentStats> = {};

  // Build a map of match_id -> first pick team (0=radiant, 1=dire)
  const firstPickByMatch: Record<number, number> = {};
  for (const row of picksBansRows) {
    const matchId = Number(row.match_id);
    const isPick = Boolean(row.is_pick);
    const order = Number(row.order);
    const team = Number(row.team);

    if (isPick && (firstPickByMatch[matchId] === undefined || order < 999)) {
      // Find the lowest order pick
      if (firstPickByMatch[matchId] === undefined) {
        firstPickByMatch[matchId] = team;
      }
    }
  }

  // Actually, let's recompute more carefully
  const firstPickOrderByMatch: Record<number, { team: number; order: number }> = {};
  for (const row of picksBansRows) {
    const matchId = Number(row.match_id);
    const isPick = Boolean(row.is_pick);
    const order = Number(row.order);
    const team = Number(row.team);

    if (isPick) {
      if (
        firstPickOrderByMatch[matchId] === undefined ||
        order < firstPickOrderByMatch[matchId].order
      ) {
        firstPickOrderByMatch[matchId] = { team, order };
      }
    }
  }

  for (const match of matches) {
    const teams = [
      { id: match.radiant_team_id, name: match.radiant_team_name, isRadiant: true },
      { id: match.dire_team_id, name: match.dire_team_name, isRadiant: false },
    ];

    const firstPickInfo = firstPickOrderByMatch[match.match_id];

    for (const t of teams) {
      if (!t.id) continue;

      if (!teamMap[t.id]) {
        teamMap[t.id] = {
          team_id: t.id,
          team_name: t.name || `Team ${t.id}`,
          wins: 0,
          losses: 0,
          win_rate: 0,
          radiant_wins: 0,
          radiant_losses: 0,
          dire_wins: 0,
          dire_losses: 0,
          radiant_win_rate: 0,
          dire_win_rate: 0,
          first_pick_wins: 0,
          first_pick_losses: 0,
          first_pick_win_rate: 0,
          second_pick_wins: 0,
          second_pick_losses: 0,
          second_pick_win_rate: 0,
        };
      }

      const stats = teamMap[t.id];
      const teamWon = t.isRadiant ? match.radiant_win : !match.radiant_win;

      if (teamWon) stats.wins++;
      else stats.losses++;

      if (t.isRadiant) {
        if (teamWon) stats.radiant_wins++;
        else stats.radiant_losses++;
      } else {
        if (teamWon) stats.dire_wins++;
        else stats.dire_losses++;
      }

      // First/second pick stats
      if (firstPickInfo) {
        const teamSide = t.isRadiant ? 0 : 1;
        const hadFirstPick = firstPickInfo.team === teamSide;
        if (hadFirstPick) {
          if (teamWon) stats.first_pick_wins++;
          else stats.first_pick_losses++;
        } else {
          if (teamWon) stats.second_pick_wins++;
          else stats.second_pick_losses++;
        }
      }
    }
  }

  return Object.values(teamMap).map((t) => {
    const total = t.wins + t.losses;
    const radiantTotal = t.radiant_wins + t.radiant_losses;
    const direTotal = t.dire_wins + t.dire_losses;
    const fpTotal = t.first_pick_wins + t.first_pick_losses;
    const spTotal = t.second_pick_wins + t.second_pick_losses;

    return {
      ...t,
      win_rate: total > 0 ? (t.wins / total) * 100 : 0,
      radiant_win_rate: radiantTotal > 0 ? (t.radiant_wins / radiantTotal) * 100 : 0,
      dire_win_rate: direTotal > 0 ? (t.dire_wins / direTotal) * 100 : 0,
      first_pick_win_rate: fpTotal > 0 ? (t.first_pick_wins / fpTotal) * 100 : 0,
      second_pick_win_rate: spTotal > 0 ? (t.second_pick_wins / spTotal) * 100 : 0,
    };
  });
}

export function getHeroName(heroId: number, heroes: HeroConstants): string {
  return heroes[heroId]?.localized_name || `Hero ${heroId}`;
}

export function getHeroInternalName(heroId: number, heroes: HeroConstants): string {
  return heroes[heroId]?.name || '';
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatWinRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

export function winRateColor(rate: number): string {
  if (rate >= 60) return '#4ade80';
  if (rate >= 50) return '#facc15';
  return '#f87171';
}

export function kda(kills: number, deaths: number, assists: number): number {
  if (deaths === 0) return kills + assists;
  return (kills + assists) / deaths;
}

export function classNames(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
