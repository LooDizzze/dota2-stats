'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getTeam, getTeamMatches, getTeamHeroes, getTeamPlayers, getTeamRecentPlayers, getHeroImageUrl, formatDuration } from '@/lib/opendota';
import { formatDate, formatWinRate, winRateColor } from '@/lib/utils';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';
import StatCard from '@/components/StatCard';
import Image from 'next/image';

function useHeroConstants() {
  return useQuery({
    queryKey: ['hero-constants'],
    queryFn: async () => {
      const res = await fetch('https://api.opendota.com/api/constants/heroes');
      return res.json() as Promise<Record<string, { id: number; name: string; localized_name: string }>>;
    },
    staleTime: Infinity,
  });
}

type Tab = 'matches' | 'heroes' | 'players';

interface PlayerRow {
  account_id: number;
  name: string;
  games_played: number;
  wins: number;
  is_current_team_member: boolean;
}

function PlayersTab({ players, isLoading, teamId }: { players: PlayerRow[] | undefined; isLoading: boolean; teamId: number }) {
  const [showFormer, setShowFormer] = useState(false);

  const { data: recentPlayers, isLoading: recentLoading } = useQuery({
    queryKey: ['team-recent-players', teamId],
    queryFn: () => getTeamRecentPlayers(teamId),
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  if (isLoading) return <LoadingSpinner text="Loading players..." />;

  // Build a set of account_ids who played in recent 90 days
  const recentIds = new Set((recentPlayers || []).map((p) => p.account_id));
  const recentGamesById = new Map((recentPlayers || []).map((p) => [p.account_id, p.games]));

  // Players seen in recent matches = current roster; sort by recent games desc
  const current = (players || [])
    .filter((p) => recentIds.has(p.account_id))
    .sort((a, b) => (recentGamesById.get(b.account_id) || 0) - (recentGamesById.get(a.account_id) || 0));

  const former = (players || [])
    .filter((p) => !recentIds.has(p.account_id))
    .sort((a, b) => b.games_played - a.games_played);

  function PlayerRows({ rows, dim }: { rows: PlayerRow[]; dim?: boolean }) {
    return (
      <>
        {rows.map((p) => {
          const rate = p.games_played > 0 ? (p.wins / p.games_played) * 100 : 0;
          const recentGames = recentGamesById.get(p.account_id);
          return (
            <tr key={p.account_id} style={{ opacity: dim ? 0.5 : 1 }}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>{p.name || `Player #${p.account_id}`}</span>
                  {recentGames !== undefined && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(77,186,135,0.1)', color: 'var(--color-radiant)', fontWeight: 700 }}>
                      {recentGames}G / 90d
                    </span>
                  )}
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>{p.games_played}</td>
              <td style={{ textAlign: 'center', color: 'var(--color-radiant)' }}>{p.wins}</td>
              <td style={{ textAlign: 'right' }}>
                <span style={{ color: winRateColor(rate), fontWeight: 600 }}>{formatWinRate(rate)}</span>
              </td>
            </tr>
          );
        })}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Current roster from recent matches */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Current Roster</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>played in the last 90 days</span>
          {recentLoading && <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Loading...</span>}
        </div>
        {current.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {current.map((p) => {
              const rate = p.games_played > 0 ? (p.wins / p.games_played) * 100 : null;
              const recentGames = recentGamesById.get(p.account_id) || 0;
              return (
                <div key={p.account_id} style={{ padding: '6px 14px', background: 'var(--color-card-hover)', border: '1px solid var(--color-border)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{p.name || `#${p.account_id}`}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{recentGames} games</span>
                  {rate !== null && (
                    <span style={{ fontSize: 10, color: winRateColor(rate), fontWeight: 600 }}>{rate.toFixed(0)}% WR</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : !recentLoading && (
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>No recent match data.</div>
        )}
      </div>

      {/* All-time stats table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>
          All-time stats
        </div>
        <table className="dota-table">
          <thead>
            <tr>
              <th>Player</th>
              <th style={{ textAlign: 'center' }}>Games</th>
              <th style={{ textAlign: 'center' }}>Wins</th>
              <th style={{ textAlign: 'right' }}>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            <PlayerRows rows={current} />
          </tbody>
        </table>

        {former.length > 0 && (
          <>
            <button
              onClick={() => setShowFormer((v) => !v)}
              style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}
            >
              {showFormer ? '▼' : '▶'} Former players ({former.length})
            </button>
            {showFormer && (
              <table className="dota-table">
                <tbody><PlayerRows rows={former} dim /></tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const params = useParams();
  const teamId = Number(params.id);
  const [tab, setTab] = useState<Tab>('matches');
  const { data: heroes } = useHeroConstants();

  const { data: team, isLoading: teamLoading, error } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId),
  });

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['team-matches', teamId],
    queryFn: () => getTeamMatches(teamId),
  });

  const { data: teamHeroes, isLoading: heroesLoading } = useQuery({
    queryKey: ['team-heroes', teamId],
    queryFn: () => getTeamHeroes(teamId),
    enabled: tab === 'heroes',
  });

  const { data: players, isLoading: playersLoading } = useQuery({
    queryKey: ['team-players', teamId],
    queryFn: () => getTeamPlayers(teamId),
    enabled: tab === 'players',
  });

  if (teamLoading) return <LoadingSpinner text="Loading team..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!team) return null;

  const totalMatches = matches?.length || 0;
  const teamWins = matches?.filter((m: { radiant: boolean; radiant_win: boolean }) => {
    return (m.radiant && m.radiant_win) || (!m.radiant && !m.radiant_win);
  }).length || 0;
  const teamLosses = totalMatches - teamWins;
  const winRate = totalMatches > 0 ? (teamWins / totalMatches) * 100 : 0;

  const recentMatches = [...(matches || [])].sort((a: { start_time: number }, b: { start_time: number }) => b.start_time - a.start_time).slice(0, 30);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'matches', label: 'Recent Matches' },
    { key: 'heroes', label: 'Hero Stats' },
    { key: 'players', label: 'Players' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Back */}
      <Link href="/teams" style={{ fontSize: '12px', color: 'var(--color-muted)', textDecoration: 'none' }}>
        ← All Teams
      </Link>

      {/* Team header */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '4px' }}>
              {team.name}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
              [{team.tag}]
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <StatCard label="Wins" value={team.wins || teamWins} color="var(--color-radiant)" />
        <StatCard label="Losses" value={team.losses || teamLosses} color="var(--color-dire)" />
        <StatCard
          label="Win Rate"
          value={formatWinRate(winRate)}
          sub={`${totalMatches} matches`}
          color={winRate >= 50 ? 'var(--color-radiant)' : 'var(--color-dire)'}
        />
        {team.rating && (
          <StatCard label="Rating" value={Math.round(team.rating)} color="var(--color-gold-bright)" />
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: '4px' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--color-gold-bright)' : 'var(--color-muted)',
              borderBottom: `2px solid ${tab === t.key ? 'var(--color-gold)' : 'transparent'}`,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Matches tab */}
      {tab === 'matches' && (
        <div className="card" style={{ padding: 0 }}>
          {matchesLoading ? (
            <LoadingSpinner text="Loading matches..." />
          ) : (
            <>
              {recentMatches.map((m: {
                match_id: number;
                radiant: boolean;
                radiant_win: boolean;
                opposing_team_name: string;
                opposing_team_id: number;
                duration: number;
                start_time: number;
                leagueid: number;
                league_name?: string;
              }) => {
                const won = (m.radiant && m.radiant_win) || (!m.radiant && !m.radiant_win);
                return (
                  <Link key={m.match_id} href={`/matches/${m.match_id}`} style={{ textDecoration: 'none' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '70px 1fr 80px 80px 100px',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--color-border)',
                        gap: '12px',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div>
                        <span className={won ? 'badge-win' : 'badge-loss'}>
                          {won ? 'WIN' : 'LOSS'}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>
                          vs {m.opposing_team_name || `Team #${m.opposing_team_id}`}
                        </div>
                        {m.league_name && (
                          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                            {m.league_name}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-muted)', textAlign: 'center' }}>
                        {m.radiant ? 'Radiant' : 'Dire'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-muted)', textAlign: 'center' }}>
                        {formatDuration(m.duration)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-muted)', textAlign: 'right' }}>
                        {formatDate(m.start_time)}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {recentMatches.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
                  No match history available.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Heroes tab */}
      {tab === 'heroes' && (
        <div className="card" style={{ padding: 0 }}>
          {heroesLoading ? (
            <LoadingSpinner text="Loading hero stats..." />
          ) : (
            <table className="dota-table">
              <thead>
                <tr>
                  <th>Hero</th>
                  <th style={{ textAlign: 'center' }}>Games</th>
                  <th style={{ textAlign: 'center' }}>Wins</th>
                  <th style={{ textAlign: 'right' }}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {((teamHeroes as { hero_id: number; games: number; wins: number }[]) || [])
                  .sort((a, b) => b.games - a.games)
                  .slice(0, 30)
                  .map((h) => {
                    const heroData = heroes?.[String(h.hero_id)];
                    const rate = h.games > 0 ? (h.wins / h.games) * 100 : 0;
                    return (
                      <tr key={h.hero_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {heroData && (
                              <Image
                                src={getHeroImageUrl(heroData.name)}
                                alt={heroData.localized_name}
                                width={52}
                                height={29}
                                style={{ borderRadius: 3 }}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <span style={{ fontWeight: 500 }}>
                              {heroData?.localized_name || `Hero #${h.hero_id}`}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{h.games}</td>
                        <td style={{ textAlign: 'center', color: 'var(--color-radiant)' }}>{h.wins}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ color: winRateColor(rate), fontWeight: 600 }}>
                            {formatWinRate(rate)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && (
        <PlayersTab players={players as PlayerRow[] | undefined} isLoading={playersLoading} teamId={teamId} />
      )}
    </div>
  );
}
