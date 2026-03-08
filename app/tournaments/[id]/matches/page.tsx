'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagueMatches, getPatchConstants, getMatchPatch, formatDuration } from '@/lib/opendota';
import { formatDate } from '@/lib/utils';
import { LeagueMatch } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

function MatchRow({ match, patch }: { match: LeagueMatch; patch: string }) {
  const winner = match.radiant_win ? match.radiant_team_name : match.dire_team_name;
  const loser = match.radiant_win ? match.dire_team_name : match.radiant_team_name;
  const winnerScore = match.radiant_win ? match.radiant_score : match.dire_score;
  const loserScore = match.radiant_win ? match.dire_score : match.radiant_score;

  return (
    <Link href={`/matches/${match.match_id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 1fr 70px 80px 80px',
          alignItems: 'center',
          padding: '11px 16px',
          borderBottom: '1px solid var(--color-border)',
          gap: '12px',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, color: 'var(--color-radiant)', fontSize: '13px' }}>
            {winner || (match.radiant_win ? 'Radiant' : 'Dire')}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px' }}>
            {match.radiant_win ? 'Radiant' : 'Dire'}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>
          {winnerScore} – {loserScore}
        </div>
        <div>
          <div style={{ fontWeight: 500, color: 'var(--color-muted)', fontSize: '13px' }}>
            {loser || (match.radiant_win ? 'Dire' : 'Radiant')}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-dim)', marginTop: '1px' }}>
            {match.radiant_win ? 'Dire' : 'Radiant'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-gold)', background: 'rgba(201,162,39,0.1)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
            {patch !== 'unknown' ? patch : '—'}
          </span>
        </div>
        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-muted)' }}>
          {formatDuration(match.duration)}
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-muted)' }}>
          {formatDate(match.start_time)}
        </div>
      </div>
    </Link>
  );
}

export default function MatchesPage() {
  const params = useParams();
  const id = Number(params.id);
  const [search, setSearch] = useState('');
  const [patchFilter, setPatchFilter] = useState('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: matches, isLoading, error } = useQuery({
    queryKey: ['league-matches', id],
    queryFn: () => getLeagueMatches(id),
  });

  const { data: patches } = useQuery({
    queryKey: ['patch-constants'],
    queryFn: getPatchConstants,
    staleTime: Infinity,
  });

  // Compute patch per match
  const matchesWithPatch = useMemo(() => {
    if (!matches) return [];
    return matches.map((m) => ({
      ...m,
      patch: patches ? getMatchPatch(m.start_time, patches) : 'unknown',
    }));
  }, [matches, patches]);

  // Available patches in this tournament
  const availablePatches = useMemo(() => {
    const set = new Set<string>();
    matchesWithPatch.forEach((m) => { if (m.patch !== 'unknown') set.add(m.patch); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [matchesWithPatch]);

  const filtered = useMemo(() => {
    return matchesWithPatch
      .filter((m) => {
        const matchesSearch = !search || (
          m.radiant_team_name?.toLowerCase().includes(search.toLowerCase()) ||
          m.dire_team_name?.toLowerCase().includes(search.toLowerCase()) ||
          String(m.match_id).includes(search)
        );
        const matchesPatch = patchFilter === 'all' || m.patch === patchFilter;
        return matchesSearch && matchesPatch;
      })
      .sort((a, b) => sortDir === 'desc' ? b.start_time - a.start_time : a.start_time - b.start_time);
  }, [matchesWithPatch, search, patchFilter, sortDir]);

  if (isLoading) return <LoadingSpinner text="Loading matches..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search team..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-card)',
            color: 'var(--color-text)',
            fontSize: '13px',
            width: '220px',
            outline: 'none',
          }}
        />

        {/* Patch filter */}
        {availablePatches.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <PatchBtn active={patchFilter === 'all'} onClick={() => setPatchFilter('all')}>All Patches</PatchBtn>
            {availablePatches.map((p) => (
              <PatchBtn key={p} active={patchFilter === p} onClick={() => setPatchFilter(p)}>{p}</PatchBtn>
            ))}
          </div>
        )}

        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-card)',
            color: 'var(--color-muted)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
        </button>

        <span style={{ fontSize: '13px', color: 'var(--color-muted)', marginLeft: 'auto' }}>
          {filtered.length} matches
        </span>
      </div>

      <div className="card">
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 70px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', gap: '12px' }}>
          {['Winner', 'Score', 'Loser', 'Patch', 'Duration', 'Date'].map((label, i) => (
            <div key={label} style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', textAlign: i === 0 ? 'right' : i === 5 ? 'right' : i >= 3 ? 'center' : 'left' }}>
              {label}
            </div>
          ))}
        </div>

        {filtered.map((match) => (
          <MatchRow key={match.match_id} match={match} patch={match.patch} />
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px' }}>
            No matches found.
          </div>
        )}
      </div>
    </div>
  );
}

function PatchBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: '6px',
        border: `1px solid ${active ? 'var(--color-gold)' : 'var(--color-border)'}`,
        background: active ? 'rgba(201,162,39,0.12)' : 'var(--color-card)',
        color: active ? 'var(--color-gold-bright)' : 'var(--color-muted)',
        fontSize: '12px',
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
