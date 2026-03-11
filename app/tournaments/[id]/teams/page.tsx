'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagueMatches, getLeagueTeams, getLeaguePicksBans } from '@/lib/opendota';
import { computeTeamStats, formatWinRate, winRateColor } from '@/lib/utils';
import { TeamTournamentStats } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

type SortKey = keyof TeamTournamentStats;

function WinRateBar({ wins, losses, color }: { wins: number; losses: number; color: string }) {
  const total = wins + losses;
  if (total === 0) return <span style={{ color: 'var(--color-muted)' }}>—</span>;
  const rate = (wins / total) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '60px', height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '12px', color: winRateColor(rate), fontWeight: 600, minWidth: '40px' }}>
        {rate.toFixed(0)}%
      </span>
      <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>({wins}/{total})</span>
    </div>
  );
}

export default function TeamsPage() {
  const params = useParams();
  const id = Number(params.id);
  const [sortKey, setSortKey] = useState<SortKey>('wins');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: matches, isLoading: matchLoading, error } = useQuery({
    queryKey: ['league-matches', id],
    queryFn: () => getLeagueMatches(id),
  });

  const { data: teams } = useQuery({
    queryKey: ['league-teams', id],
    queryFn: () => getLeagueTeams(id),
  });

  const { data: picksBans, isLoading: pbLoading } = useQuery({
    queryKey: ['league-picks-bans', id],
    queryFn: () => getLeaguePicksBans(id),
    enabled: !!matches,
  });

  // Build teamId → name map — must be a hook, so placed before early returns.
  const teamNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of (teams || [])) map[t.team_id] = t.name;
    return map;
  }, [teams]);

  if (matchLoading) return <LoadingSpinner text="Loading team stats..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;

  const pbRows = picksBans?.rows || [];
  const teamStats = matches ? computeTeamStats(matches, pbRows, teamNames) : [];
  const sorted = [...teamStats].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortTh({ label, field, align = 'left' }: { label: string; field: SortKey; align?: string }) {
    const active = sortKey === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        style={{ cursor: 'pointer', textAlign: align as 'left' | 'right' | 'center' }}
      >
        <span style={{ color: active ? 'var(--color-gold-bright)' : undefined }}>
          {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </span>
      </th>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
          {sorted.length} teams · {matches?.length || 0} matches
          {pbLoading && ' · Loading draft data...'}
        </span>
      </div>

      <div className="card">
        <table className="dota-table">
          <thead>
            <tr>
              <th>#</th>
              <SortTh label="Team" field="team_name" />
              <SortTh label="W" field="wins" align="center" />
              <SortTh label="L" field="losses" align="center" />
              <SortTh label="Win%" field="win_rate" align="center" />
              <th style={{ textAlign: 'center' }}>Radiant</th>
              <th style={{ textAlign: 'center' }}>Dire</th>
              <th style={{ textAlign: 'center' }}>1st Pick</th>
              <th style={{ textAlign: 'center' }}>2nd Pick</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.team_id}>
                <td style={{ color: 'var(--color-muted)', width: '32px' }}>{i + 1}</td>
                <td>
                  <Link
                    href={`/teams/${t.team_id}`}
                    style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    {t.team_name}
                  </Link>
                </td>
                <td style={{ textAlign: 'center', color: 'var(--color-radiant)', fontWeight: 700 }}>{t.wins}</td>
                <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{t.losses}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: winRateColor(t.win_rate), fontWeight: 700 }}>
                    {formatWinRate(t.win_rate)}
                  </span>
                </td>
                <td>
                  <WinRateBar wins={t.radiant_wins} losses={t.radiant_losses} color="var(--color-radiant)" />
                </td>
                <td>
                  <WinRateBar wins={t.dire_wins} losses={t.dire_losses} color="var(--color-dire)" />
                </td>
                <td>
                  {pbRows.length > 0
                    ? <WinRateBar wins={t.first_pick_wins} losses={t.first_pick_losses} color="var(--color-gold)" />
                    : <span style={{ color: 'var(--color-muted)', fontSize: '12px' }}>—</span>
                  }
                </td>
                <td>
                  {pbRows.length > 0
                    ? <WinRateBar wins={t.second_pick_wins} losses={t.second_pick_losses} color="#7c9cbf" />
                    : <span style={{ color: 'var(--color-muted)', fontSize: '12px' }}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px' }}>
            No team data available for this tournament.
          </div>
        )}
      </div>
    </div>
  );
}
