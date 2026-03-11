'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagueMatches, getLeagueTeams, getPatchConstants, getMatchPatch, formatDuration } from '@/lib/opendota';
import { formatDate, computeMapNumbers } from '@/lib/utils';
import { LeagueMatch } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

// ─── Match row ─────────────────────────────────────────────────────────────────

function MatchRow({
  match,
  patch,
  teamNames,
  mapNum,
}: {
  match: LeagueMatch;
  patch: string;
  teamNames: Record<number, string>;
  mapNum?: number;
}) {
  const radiantName = teamNames[match.radiant_team_id] || match.radiant_team_name || 'Unknown';
  const direName   = teamNames[match.dire_team_id]    || match.dire_team_name    || 'Unknown';
  const winnerName  = match.radiant_win ? radiantName : direName;
  const loserName   = match.radiant_win ? direName    : radiantName;
  const winnerScore = match.radiant_win ? match.radiant_score : match.dire_score;
  const loserScore  = match.radiant_win ? match.dire_score    : match.radiant_score;
  const winnerSide  = match.radiant_win ? 'Radiant' : 'Dire';
  const loserSide   = match.radiant_win ? 'Dire'    : 'Radiant';

  const seriesLabel = match.series_type === 1 ? 'Bo3' : match.series_type === 2 ? 'Bo5' : null;

  return (
    <Link href={`/matches/${match.match_id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 1fr 70px 80px 80px',
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
        {/* Winner */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, color: 'var(--color-radiant)', fontSize: '13px' }}>
            {winnerName}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px' }}>
            {winnerSide}
          </div>
        </div>

        {/* Score + map/series info */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>
            {winnerScore} – {loserScore}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
            {mapNum !== undefined && (
              <span style={{
                fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--color-dim)',
                background: 'var(--color-border)', borderRadius: '3px',
                padding: '1px 5px',
              }}>
                Map {mapNum}
              </span>
            )}
            {seriesLabel && (
              <span style={{ fontSize: '9px', color: 'var(--color-dim)', fontWeight: 600 }}>
                {seriesLabel}
              </span>
            )}
          </div>
        </div>

        {/* Loser */}
        <div>
          <div style={{ fontWeight: 500, color: 'var(--color-muted)', fontSize: '13px' }}>
            {loserName}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-dim)', marginTop: '1px' }}>
            {loserSide}
          </div>
        </div>

        {/* Patch */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-gold)', background: 'rgba(201,162,39,0.1)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>
            {patch !== 'unknown' ? patch : '—'}
          </span>
        </div>

        {/* Duration */}
        <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-muted)' }}>
          {formatDuration(match.duration)}
        </div>

        {/* Date */}
        <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-muted)' }}>
          {formatDate(match.start_time)}
        </div>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

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

  const { data: teams } = useQuery({
    queryKey: ['league-teams', id],
    queryFn: () => getLeagueTeams(id),
  });

  const { data: patches } = useQuery({
    queryKey: ['patch-constants'],
    queryFn: getPatchConstants,
    staleTime: Infinity,
  });

  // Build teamId → name map (same pattern as overview and teams pages)
  const teamNames = useMemo(() => {
    const map: Record<number, string> = {};
    for (const t of (teams || [])) map[t.team_id] = t.name;
    return map;
  }, [teams]);

  // Compute patch per match
  const matchesWithPatch = useMemo(() => {
    if (!matches) return [];
    return matches.map((m) => ({
      ...m,
      patch: patches ? getMatchPatch(m.start_time, patches) : 'unknown',
    }));
  }, [matches, patches]);

  // Available patches for the filter buttons
  const availablePatches = useMemo(() => {
    const set = new Set<string>();
    matchesWithPatch.forEach((m) => { if (m.patch !== 'unknown') set.add(m.patch); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [matchesWithPatch]);

  // Map numbers computed over ALL matches so "Map 3" shows correctly
  // even when the earlier games in the series are filtered out.
  const mapNumbers = useMemo(
    () => computeMapNumbers(matches || []),
    [matches]
  );

  // Filter + sort. Search checks resolved team names first, falls back to the
  // embedded name field, then match ID.
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return matchesWithPatch
      .filter((m) => {
        const radiant = (teamNames[m.radiant_team_id] || m.radiant_team_name || '').toLowerCase();
        const dire    = (teamNames[m.dire_team_id]    || m.dire_team_name    || '').toLowerCase();
        const matchesSearch = !q || radiant.includes(q) || dire.includes(q) || String(m.match_id).includes(q);
        const matchesPatch  = patchFilter === 'all' || m.patch === patchFilter;
        return matchesSearch && matchesPatch;
      })
      .sort((a, b) => sortDir === 'desc' ? b.start_time - a.start_time : a.start_time - b.start_time);
  }, [matchesWithPatch, teamNames, search, patchFilter, sortDir]);

  if (isLoading) return <LoadingSpinner text="Loading matches..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search team or match ID..."
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 70px 80px 80px', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', gap: '12px' }}>
          {(['Winner', 'Score / Map', 'Loser', 'Patch', 'Duration', 'Date'] as const).map((label, i) => (
            <div key={label} style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', textAlign: i === 0 ? 'right' : i === 5 ? 'right' : i >= 3 ? 'center' : 'left' }}>
              {label}
            </div>
          ))}
        </div>

        {filtered.map((match) => (
          <MatchRow
            key={match.match_id}
            match={match}
            patch={match.patch}
            teamNames={teamNames}
            mapNum={mapNumbers.get(match.match_id)}
          />
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
