'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';
import { formatWinRate, winRateColor } from '@/lib/utils';

interface TeamListing {
  team_id: number;
  name: string;
  tag: string;
  wins: number;
  losses: number;
  logo_url?: string;
}

const LS_KEY = 'teams:hidden';

export default function TeamsPage() {
  const [search, setSearch] = useState('');
  const [hiddenTeamIds, setHiddenTeamIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setHiddenTeamIds(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  function hideTeam(id: number) {
    setHiddenTeamIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function resetHidden() {
    setHiddenTeamIds(new Set());
    try { localStorage.removeItem(LS_KEY); } catch {}
  }

  const { data: teams, isLoading, error } = useQuery({
    queryKey: ['all-teams'],
    queryFn: async () => {
      const res = await fetch('/api/backend-teams');
      if (!res.ok) throw new Error('Backend unavailable');
      return res.json() as Promise<TeamListing[]>;
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <LoadingSpinner text="Loading teams..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;

  const filtered = (teams || [])
    .filter((t) => !hiddenTeamIds.has(t.team_id))
    .filter((t) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return t.name?.toLowerCase().includes(s) || t.tag?.toLowerCase().includes(s);
    })
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '8px' }}>Teams</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
          Teams from our match database, sorted by games played.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', fontSize: '13px', width: '240px', outline: 'none' }}
        />
        <span style={{ fontSize: '13px', color: 'var(--color-muted)', alignSelf: 'center' }}>
          {filtered.length} teams
        </span>
        {hiddenTeamIds.size > 0 && (
          <button onClick={resetHidden} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-muted)', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto' }}>
            Reset hidden ({hiddenTeamIds.size})
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table className="dota-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th style={{ textAlign: 'center' }}>Tag</th>
              <th style={{ textAlign: 'center' }}>W</th>
              <th style={{ textAlign: 'center' }}>L</th>
              <th style={{ textAlign: 'center' }}>Games</th>
              <th style={{ textAlign: 'right' }}>Win Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const total = t.wins + t.losses;
              const rate = total > 0 ? (t.wins / total) * 100 : 0;
              return (
                <tr key={t.team_id} className="group">
                  <td style={{ color: 'var(--color-muted)', width: '40px' }}>{i + 1}</td>
                  <td>
                    <Link href={`/teams/${t.team_id}`} style={{ color: 'var(--color-text)', textDecoration: 'none', fontWeight: 600 }}>
                      {t.name}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '12px' }}>[{t.tag}]</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-radiant)', fontWeight: 600 }}>{t.wins}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{t.losses}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-dim)' }}>{total}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: winRateColor(rate), fontWeight: 600 }}>{formatWinRate(rate)}</span>
                  </td>
                  <td style={{ textAlign: 'right', width: '32px' }}>
                    <button
                      onClick={() => hideTeam(t.team_id)}
                      title="Hide"
                      className="opacity-0 group-hover:opacity-100"
                      style={{ background: 'none', border: 'none', color: 'var(--color-dim)', cursor: 'pointer', fontSize: '14px', padding: '0 4px', lineHeight: 1, transition: 'opacity 0.15s' }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = 'var(--color-dire)')}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--color-dim)')}
                    >✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
