'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { getLeagueMatches, getLeaguePicksBans, getHeroImageUrl } from '@/lib/opendota';
import { computeHeroStatsFromExplorer, formatWinRate, winRateColor } from '@/lib/utils';
import { HeroStats } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

type SortKey = 'presence' | 'picks' | 'bans' | 'win_rate' | 'pick_rate' | 'ban_rate';
type SortDir = 'asc' | 'desc';

// Hero names fetched from constants
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

function HeroRow({ hero, heroes, rank }: { hero: HeroStats; heroes: Record<string, { id: number; name: string; localized_name: string }> | undefined; rank: number }) {
  const heroData = heroes?.[String(hero.hero_id)];
  const imgSrc = heroData ? getHeroImageUrl(heroData.name) : null;

  return (
    <tr>
      <td style={{ color: 'var(--color-muted)', width: '32px' }}>{rank}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {imgSrc ? (
            <Image
              src={imgSrc}
              alt={heroData?.localized_name || ''}
              width={60}
              height={34}
              style={{ borderRadius: '4px', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div style={{ width: 60, height: 34, background: 'var(--color-border)', borderRadius: 4 }} />
          )}
          <span style={{ fontWeight: 500 }}>
            {heroData?.localized_name || `Hero #${hero.hero_id}`}
          </span>
        </div>
      </td>
      <td style={{ textAlign: 'center', fontWeight: 600 }}>{hero.picks}</td>
      <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{hero.bans}</td>
      <td style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ flex: 1, height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(hero.presence, 100)}%`, height: '100%', background: 'var(--color-gold)', borderRadius: '3px' }} />
          </div>
          <span style={{ fontSize: '12px', minWidth: '42px', textAlign: 'right' }}>{hero.presence.toFixed(1)}%</span>
        </div>
      </td>
      <td style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 600, color: hero.picks > 0 ? winRateColor(hero.win_rate) : 'var(--color-muted)' }}>
          {hero.picks > 0 ? formatWinRate(hero.win_rate) : '—'}
        </span>
      </td>
      <td style={{ textAlign: 'right', color: 'var(--color-muted)' }}>
        {hero.wins}W / {hero.losses}L
      </td>
    </tr>
  );
}

export default function HeroesPage() {
  const params = useParams();
  const id = Number(params.id);
  const [sortKey, setSortKey] = useState<SortKey>('presence');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<'all' | 'picks' | 'bans'>('all');

  const { data: heroes } = useHeroConstants();

  const { data: matches } = useQuery({
    queryKey: ['league-matches', id],
    queryFn: () => getLeagueMatches(id),
  });

  const { data: picksBans, isLoading, error } = useQuery({
    queryKey: ['league-picks-bans', id],
    queryFn: () => getLeaguePicksBans(id),
  });

  const totalMatches = matches?.length || 0;
  const pbRows = picksBans?.rows || [];

  const heroStats = totalMatches > 0 && pbRows.length > 0
    ? computeHeroStatsFromExplorer(pbRows, totalMatches)
    : [];

  const filtered = heroStats.filter((h) => {
    if (filter === 'picks') return h.picks > 0;
    if (filter === 'bans') return h.bans > 0;
    return h.picks + h.bans > 0;
  });

  const sorted = [...filtered].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === 'desc' ? -diff : diff;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const active = sortKey === field;
    return (
      <th onClick={() => toggleSort(field)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ color: active ? 'var(--color-gold-bright)' : undefined }}>
          {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </span>
      </th>
    );
  }

  if (isLoading) return <LoadingSpinner text="Loading hero stats..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'picks', 'bans'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: filter === f ? 600 : 400,
                background: filter === f ? 'rgba(201, 162, 39, 0.15)' : 'var(--color-card)',
                color: filter === f ? 'var(--color-gold-bright)' : 'var(--color-muted)',
              }}
            >
              {f === 'all' ? 'All Heroes' : f === 'picks' ? 'Picked' : 'Banned'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '13px', color: 'var(--color-muted)', marginLeft: 'auto' }}>
          {sorted.length} heroes · {totalMatches} matches
        </span>
      </div>

      <div className="card">
        <table className="dota-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Hero</th>
              <SortHeader label="Picks" field="picks" />
              <SortHeader label="Bans" field="bans" />
              <SortHeader label="Presence" field="presence" />
              <SortHeader label="Win Rate" field="win_rate" />
              <th style={{ textAlign: 'right' }}>Record</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((hero, i) => (
              <HeroRow key={hero.hero_id} hero={hero} heroes={heroes} rank={i + 1} />
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && pbRows.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px' }}>
            No hero data available. Pick/ban data may not be parsed for this tournament.
          </div>
        )}
      </div>
    </div>
  );
}
