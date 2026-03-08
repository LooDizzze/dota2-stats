'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagueMatches, getLeagueTeams, getLeaguePicksBans, formatDuration } from '@/lib/opendota';
import { computeHeroStatsFromExplorer, computeTeamStats, formatWinRate, winRateColor, formatDate } from '@/lib/utils';
import StatCard from '@/components/StatCard';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

export default function TournamentOverview() {
  const params = useParams();
  const id = Number(params.id);

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['league-matches', id],
    queryFn: () => getLeagueMatches(id),
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['league-teams', id],
    queryFn: () => getLeagueTeams(id),
  });

  const { data: picksBans, isLoading: pbLoading } = useQuery({
    queryKey: ['league-picks-bans', id],
    queryFn: () => getLeaguePicksBans(id),
    enabled: !!matches,
  });

  const isLoading = matchesLoading || teamsLoading;

  if (isLoading) return <LoadingSpinner text="Loading tournament data..." />;

  const totalMatches = matches?.length || 0;
  const radiantWins = matches?.filter((m) => m.radiant_win).length || 0;
  const direWins = totalMatches - radiantWins;
  const radiantWinRate = totalMatches > 0 ? (radiantWins / totalMatches) * 100 : 0;

  const pbRows = picksBans?.rows || [];
  const teamStats = matches ? computeTeamStats(matches, pbRows) : [];
  const sortedTeams = [...teamStats].sort((a, b) => b.wins - a.wins || b.win_rate - a.win_rate);

  const heroStats = matches && picksBans
    ? computeHeroStatsFromExplorer(pbRows, totalMatches)
    : [];
  const topHeroes = [...heroStats].sort((a, b) => b.picks + b.bans - (a.picks + a.bans)).slice(0, 5);

  // Recent matches
  const recentMatches = [...(matches || [])].sort((a, b) => b.start_time - a.start_time).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <StatCard label="Total Matches" value={totalMatches} />
        <StatCard label="Teams" value={teams?.length || teamStats.length} />
        <StatCard
          label="Radiant Win Rate"
          value={`${radiantWinRate.toFixed(1)}%`}
          sub={`${radiantWins}W / ${direWins}L`}
          color="var(--color-radiant)"
        />
        <StatCard
          label="Dire Win Rate"
          value={`${(100 - radiantWinRate).toFixed(1)}%`}
          sub={`${direWins}W / ${radiantWins}L`}
          color="var(--color-dire)"
        />
        {topHeroes.length > 0 && (
          <StatCard
            label="Unique Heroes Picked"
            value={heroStats.filter((h) => h.picks > 0).length}
          />
        )}
      </div>

      {/* Side win rate bar */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '11px' }}>
          Radiant vs Dire
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--color-radiant)', fontWeight: 700, fontSize: '18px', minWidth: '52px' }}>
            {radiantWinRate.toFixed(1)}%
          </span>
          <div style={{ flex: 1, height: '12px', background: 'var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${radiantWinRate}%`,
                background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)',
                borderRadius: '6px',
                transition: 'width 0.6s ease',
              }}
            />
          </div>
          <span style={{ color: 'var(--color-dire)', fontWeight: 700, fontSize: '18px', minWidth: '52px', textAlign: 'right' }}>
            {(100 - radiantWinRate).toFixed(1)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-muted)' }}>
          <span>Radiant ({radiantWins} wins)</span>
          <span>Dire ({direWins} wins)</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Team standings */}
        <div className="card" style={{ padding: '0' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Team Standings</span>
            <Link href={`/tournaments/${id}/teams`} style={{ fontSize: '12px', color: 'var(--color-gold)', textDecoration: 'none' }}>
              Full Stats →
            </Link>
          </div>
          <table className="dota-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th style={{ textAlign: 'center' }}>W</th>
                <th style={{ textAlign: 'center' }}>L</th>
                <th style={{ textAlign: 'right' }}>Win%</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.slice(0, 8).map((t, i) => (
                <tr key={t.team_id}>
                  <td style={{ color: 'var(--color-muted)', width: '28px' }}>{i + 1}</td>
                  <td>
                    <Link
                      href={`/teams/${t.team_id}`}
                      style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {t.team_name}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-radiant)', fontWeight: 600 }}>{t.wins}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-dire)' }}>{t.losses}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: winRateColor(t.win_rate), fontWeight: 600 }}>
                      {formatWinRate(t.win_rate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent matches */}
        <div className="card" style={{ padding: '0' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Recent Matches</span>
            <Link href={`/tournaments/${id}/matches`} style={{ fontSize: '12px', color: 'var(--color-gold)', textDecoration: 'none' }}>
              All Matches →
            </Link>
          </div>
          <div>
            {recentMatches.map((match) => (
              <Link
                key={match.match_id}
                href={`/matches/${match.match_id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
                      <span style={{ color: match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>
                        {match.radiant_team_name || 'Radiant'}
                      </span>
                      <span style={{ color: 'var(--color-muted)', margin: '0 6px' }}>vs</span>
                      <span style={{ color: !match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>
                        {match.dire_team_name || 'Dire'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                      {formatDate(match.start_time)} · {formatDuration(match.duration)}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {match.radiant_score} – {match.dire_score}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Top heroes by presence */}
      {pbLoading && (
        <div style={{ color: 'var(--color-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          Loading hero stats...
        </div>
      )}
      {topHeroes.length > 0 && (
        <div className="card" style={{ padding: '0' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>Most Contested Heroes</span>
            <Link href={`/tournaments/${id}/heroes`} style={{ fontSize: '12px', color: 'var(--color-gold)', textDecoration: 'none' }}>
              Full Hero Stats →
            </Link>
          </div>
          <table className="dota-table">
            <thead>
              <tr>
                <th>Hero</th>
                <th style={{ textAlign: 'center' }}>Picks</th>
                <th style={{ textAlign: 'center' }}>Bans</th>
                <th style={{ textAlign: 'center' }}>Presence</th>
                <th style={{ textAlign: 'right' }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {topHeroes.map((h) => (
                <tr key={h.hero_id}>
                  <td style={{ fontWeight: 500 }}>Hero #{h.hero_id}</td>
                  <td style={{ textAlign: 'center' }}>{h.picks}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{h.bans}</td>
                  <td style={{ textAlign: 'center' }}>{h.presence.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: winRateColor(h.win_rate), fontWeight: 600 }}>
                      {h.picks > 0 ? formatWinRate(h.win_rate) : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
