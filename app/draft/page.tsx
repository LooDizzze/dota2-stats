'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { getHeroImageUrl, getProHeroStats, getAllTeams, getTeamPlayers } from '@/lib/opendota';
import { ProHeroStat, Team } from '@/lib/types';

const ROLES = ['Carry', 'Support', 'Nuker', 'Disabler', 'Initiator', 'Jungler', 'Durable', 'Escape', 'Pusher'];
const ATTRS = [
  { key: 'agi', label: 'Agility', color: '#4dba87' },
  { key: 'str', label: 'Strength', color: '#e74c3c' },
  { key: 'int', label: 'Intelligence', color: '#7c9cbf' },
  { key: 'all', label: 'Universal', color: '#f0c040' },
];

interface TeamPlayer {
  account_id: number;
  name: string | null;
  games_played: number;
  wins: number;
  is_current_team_member: boolean;
}

function useHeroData() {
  const heroStats = useQuery({
    queryKey: ['pro-hero-stats'],
    queryFn: getProHeroStats,
    staleTime: 1000 * 60 * 30,
  });

  const heroConstants = useQuery({
    queryKey: ['hero-constants'],
    queryFn: async () => {
      const res = await fetch('https://api.opendota.com/api/constants/heroes');
      return res.json() as Promise<Record<string, {
        id: number; name: string; localized_name: string;
        primary_attr: string; roles: string[];
      }>>;
    },
    staleTime: Infinity,
  });

  return { heroStats, heroConstants };
}

type SlotType = 'radiant_pick' | 'radiant_ban' | 'dire_pick' | 'dire_ban';

interface Draft {
  radiant_picks: (number | null)[];
  dire_picks: (number | null)[];
  radiant_bans: (number | null)[];
  dire_bans: (number | null)[];
}

const EMPTY_DRAFT: Draft = {
  radiant_picks: [null, null, null, null, null],
  dire_picks: [null, null, null, null, null],
  radiant_bans: [null, null, null, null, null, null, null],
  dire_bans: [null, null, null, null, null, null, null],
};

const EMPTY_PLAYERS: (number | null)[] = [null, null, null, null, null];

// ─── Team Picker ───────────────────────────────────────────────────────────────

function TeamPicker({
  side,
  team,
  onSelect,
}: {
  side: 'Radiant' | 'Dire';
  team: Team | null;
  onSelect: (t: Team | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: allTeams } = useQuery({
    queryKey: ['all-teams'],
    queryFn: getAllTeams,
    staleTime: Infinity,
  });

  const filtered = useMemo(() => {
    if (!allTeams || !search.trim()) return [];
    const q = search.toLowerCase();
    return allTeams
      .filter((t) => t.rating > 0 && (t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8);
  }, [allTeams, search]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';

  if (team) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{team.name}</span>
        <span style={{ fontSize: 11, color: 'var(--color-muted)', background: 'var(--color-border)', padding: '1px 6px', borderRadius: 4 }}>{team.tag}</span>
        <button
          onClick={() => onSelect(null)}
          style={{ fontSize: 11, color: 'var(--color-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', padding: '1px 6px', marginLeft: 2 }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 10 }}>
      <input
        placeholder={`Set ${side} team...`}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${color}50`,
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          fontSize: 12,
          width: 190,
          outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 200,
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          width: 230,
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          marginTop: 2,
        }}>
          {filtered.map((t) => (
            <div
              key={t.team_id}
              onClick={() => { onSelect(t); setSearch(''); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-card-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>[{t.tag}]</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hero Slot ─────────────────────────────────────────────────────────────────

function HeroSlot({ heroId, size, label, onClick, selected, isban }: {
  heroId: number | null;
  size: number;
  label?: string;
  onClick?: () => void;
  selected?: boolean;
  isban?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      title={label}
      style={{
        width: size,
        height: Math.round(size * 0.56),
        border: selected ? '2px solid var(--color-gold)' : `2px solid ${isban ? 'rgba(192,57,43,0.4)' : 'rgba(77,186,135,0.4)'}`,
        borderRadius: 4,
        background: heroId ? 'transparent' : 'rgba(26,39,64,0.7)',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        position: 'relative',
        opacity: isban && heroId ? 0.5 : 1,
        flexShrink: 0,
        transition: 'border-color 0.15s',
        boxShadow: selected ? '0 0 8px rgba(201,162,39,0.4)' : 'none',
      }}
    >
      {heroId ? (
        <HeroImg heroId={heroId} size={size} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: Math.max(8, size * 0.18), color: 'var(--color-dim)', fontWeight: 700 }}>
            {isban ? 'BAN' : 'PICK'}
          </span>
        </div>
      )}
      {selected && (
        <div style={{ position: 'absolute', inset: 0, border: '2px solid var(--color-gold)', borderRadius: 3, pointerEvents: 'none' }} />
      )}
    </div>
  );
}

function HeroImg({ heroId, size }: { heroId: number; size: number }) {
  const { heroConstants } = useHeroData();
  const heroConst = heroConstants.data;
  const h = heroConst ? Object.values(heroConst).find((x) => x.id === heroId) : null;
  if (!h) return <div style={{ width: size, height: Math.round(size * 0.56), background: 'var(--color-border)' }} />;
  return (
    <Image
      src={getHeroImageUrl(h.name)}
      alt={h.localized_name}
      width={size}
      height={Math.round(size * 0.56)}
      style={{ objectFit: 'cover', display: 'block' }}
      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
    />
  );
}

// ─── Pick Slot with player ─────────────────────────────────────────────────────

function PickSlotWithPlayer({
  heroId,
  selected,
  onSlotClick,
  onClear,
  assignedPlayerId,
  onAssignPlayer,
  players,
}: {
  heroId: number | null;
  selected: boolean;
  onSlotClick: () => void;
  onClear: () => void;
  assignedPlayerId: number | null;
  onAssignPlayer: (accountId: number | null) => void;
  players: TeamPlayer[] | null;
}) {
  const assignedPlayer = players?.find((p) => p.account_id === assignedPlayerId) || null;
  const displayName = assignedPlayer?.name || (assignedPlayer ? `#${assignedPlayer.account_id}` : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ position: 'relative' }}>
        <HeroSlot heroId={heroId} size={72} isban={false} selected={selected} onClick={onSlotClick} />
        {heroId && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-dire)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            ×
          </button>
        )}
      </div>
      {/* Player assignment — shown if a team is selected */}
      {players !== null && heroId && (
        <select
          value={assignedPlayerId ?? ''}
          onChange={(e) => onAssignPlayer(e.target.value ? Number(e.target.value) : null)}
          onClick={(e) => e.stopPropagation()}
          title="Assign player"
          style={{
            width: 72,
            fontSize: 9,
            padding: '2px 2px',
            borderRadius: 3,
            border: `1px solid ${assignedPlayerId ? 'var(--color-gold)' : 'var(--color-border)'}`,
            background: assignedPlayerId ? 'rgba(201,162,39,0.1)' : 'var(--color-bg)',
            color: assignedPlayerId ? 'var(--color-gold-bright)' : 'var(--color-muted)',
            cursor: 'pointer',
            outline: 'none',
            textOverflow: 'ellipsis',
          }}
        >
          <option value="">— player —</option>
          {players.map((p) => (
            <option key={p.account_id} value={p.account_id}>
              {p.name || `#${p.account_id}`}
            </option>
          ))}
        </select>
      )}
      {/* Show name if team not selected but we just display a compact badge */}
      {players === null && heroId && displayName && (
        <span style={{ fontSize: 9, color: 'var(--color-muted)', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
      )}
    </div>
  );
}

// ─── Analysis Panel ────────────────────────────────────────────────────────────

function AnalysisPanel({ draft, proStats, heroConst, radiantPlayers, direPlayers, radiantAssignments, direAssignments }: {
  draft: Draft;
  proStats: ProHeroStat[];
  heroConst: Record<string, { id: number; name: string; localized_name: string; primary_attr: string; roles: string[] }>;
  radiantPlayers: TeamPlayer[] | null;
  direPlayers: TeamPlayer[] | null;
  radiantAssignments: (number | null)[];
  direAssignments: (number | null)[];
}) {
  const statsById = useMemo(() => {
    const m: Record<number, ProHeroStat> = {};
    proStats.forEach((h) => { m[h.id] = h; });
    return m;
  }, [proStats]);

  const constById = useMemo(() => {
    const m: Record<number, typeof heroConst[string]> = {};
    Object.values(heroConst).forEach((h) => { m[h.id] = h; });
    return m;
  }, [heroConst]);

  function heroWinRate(heroId: number): number | null {
    const s = statsById[heroId];
    if (!s || !s.pro_pick || s.pro_pick < 3) return null;
    return (s.pro_win / s.pro_pick) * 100;
  }

  function sideScore(picks: (number | null)[]): { score: number; rated: number } {
    let total = 0; let count = 0;
    for (const id of picks) {
      if (id === null) continue;
      const wr = heroWinRate(id);
      if (wr !== null) { total += wr; count++; }
    }
    return { score: count > 0 ? total / count : 0, rated: count };
  }

  const radScore = sideScore(draft.radiant_picks);
  const direScore = sideScore(draft.dire_picks);
  const hasAny = draft.radiant_picks.some(Boolean) || draft.dire_picks.some(Boolean);

  function SideAnalysis({ side, picks, players, assignments }: {
    side: 'Radiant' | 'Dire';
    picks: (number | null)[];
    players: TeamPlayer[] | null;
    assignments: (number | null)[];
  }) {
    const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';
    const score = side === 'Radiant' ? radScore : direScore;
    const filled = picks.filter(Boolean);

    const roles: Record<string, number> = {};
    filled.forEach((id) => {
      if (!id) return;
      const c = constById[id];
      if (!c) return;
      c.roles.forEach((r) => { roles[r] = (roles[r] || 0) + 1; });
    });

    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '12px' }}>{side} Draft</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
          {picks.map((id, i) => {
            if (!id) return (
              <div key={i} style={{ height: 28, background: 'rgba(26,39,64,0.4)', borderRadius: 4, border: '1px solid var(--color-border)' }} />
            );
            const wr = heroWinRate(id);
            const h = constById[id];
            const heroName = h?.localized_name || `Hero #${id}`;
            const assignedId = assignments[i];
            const playerObj = players?.find((p) => p.account_id === assignedId);
            const playerName = playerObj?.name || (assignedId ? `#${assignedId}` : null);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'var(--color-card-hover)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroName}</div>
                  {playerName && (
                    <div style={{ fontSize: 10, color: 'var(--color-gold)', fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName}</div>
                  )}
                </div>
                {wr !== null ? (
                  <>
                    <div style={{ width: 60, height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(wr, 100)}%`, height: '100%', background: wr >= 55 ? '#4dba87' : wr >= 45 ? '#f0c040' : '#e74c3c', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: wr >= 55 ? '#4dba87' : wr >= 45 ? '#f0c040' : '#e74c3c', minWidth: 38, textAlign: 'right' }}>
                      {wr.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>No data</span>
                )}
              </div>
            );
          })}
        </div>

        {score.rated > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--color-card)', borderRadius: 6, border: '1px solid var(--color-border)', marginBottom: '12px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Avg Win Rate</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: score.score >= 55 ? '#4dba87' : score.score >= 45 ? '#f0c040' : '#e74c3c' }}>
              {score.score.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>based on {score.rated} rated hero{score.rated !== 1 ? 's' : ''}</div>
          </div>
        )}

        {Object.keys(roles).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Roles</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                <span key={role} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(26,39,64,0.8)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  {role} {count > 1 ? `×${count}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px' }}>
        Select heroes above to see analysis
      </div>
    );
  }

  const totalR = radScore.score;
  const totalD = direScore.score;
  const advantage = totalR - totalD;

  return (
    <div>
      {radScore.rated > 0 && direScore.rated > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Draft Advantage</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: 'var(--color-radiant)', fontWeight: 700, fontSize: 16, minWidth: 48 }}>{totalR.toFixed(1)}%</span>
            <div style={{ flex: 1, height: 12, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${(totalR / (totalR + totalD)) * 100}%`,
                background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)',
                borderRadius: '6px 0 0 6px',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ color: 'var(--color-dire)', fontWeight: 700, fontSize: 16, minWidth: 48, textAlign: 'right' }}>{totalD.toFixed(1)}%</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-muted)' }}>
            {Math.abs(advantage) < 2
              ? 'Even draft'
              : advantage > 0
                ? `Radiant advantage (+${advantage.toFixed(1)}%)`
                : `Dire advantage (+${(-advantage).toFixed(1)}%)`}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20 }}>
        <SideAnalysis side="Radiant" picks={draft.radiant_picks} players={radiantPlayers} assignments={radiantAssignments} />
        <div style={{ width: 1, background: 'var(--color-border)' }} />
        <SideAnalysis side="Dire" picks={draft.dire_picks} players={direPlayers} assignments={direAssignments} />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const { heroStats, heroConstants } = useHeroData();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selectedSlot, setSelectedSlot] = useState<{ type: SlotType; index: number } | null>(null);
  const [heroSearch, setHeroSearch] = useState('');
  const [attrFilter, setAttrFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Team state
  const [radiantTeam, setRadiantTeam] = useState<Team | null>(null);
  const [direTeam, setDireTeam] = useState<Team | null>(null);

  // Player assignments: account_id per pick slot, or null
  const [radiantAssignments, setRadiantAssignments] = useState<(number | null)[]>([...EMPTY_PLAYERS]);
  const [direAssignments, setDireAssignments] = useState<(number | null)[]>([...EMPTY_PLAYERS]);

  // Fetch rosters
  const { data: radiantPlayersRaw } = useQuery({
    queryKey: ['team-players', radiantTeam?.team_id],
    queryFn: () => getTeamPlayers(radiantTeam!.team_id) as Promise<TeamPlayer[]>,
    enabled: !!radiantTeam,
    staleTime: 1000 * 60 * 10,
  });

  const { data: direPlayersRaw } = useQuery({
    queryKey: ['team-players', direTeam?.team_id],
    queryFn: () => getTeamPlayers(direTeam!.team_id) as Promise<TeamPlayer[]>,
    enabled: !!direTeam,
    staleTime: 1000 * 60 * 10,
  });

  // Filter to players with a name (active), fallback to all
  const radiantPlayers = useMemo<TeamPlayer[] | null>(() => {
    if (!radiantTeam) return null;
    if (!radiantPlayersRaw) return null;
    const current = (radiantPlayersRaw as TeamPlayer[]).filter((p) => p.is_current_team_member);
    return current.length > 0 ? current : (radiantPlayersRaw as TeamPlayer[]).slice(0, 10);
  }, [radiantTeam, radiantPlayersRaw]);

  const direPlayers = useMemo<TeamPlayer[] | null>(() => {
    if (!direTeam) return null;
    if (!direPlayersRaw) return null;
    const current = (direPlayersRaw as TeamPlayer[]).filter((p) => p.is_current_team_member);
    return current.length > 0 ? current : (direPlayersRaw as TeamPlayer[]).slice(0, 10);
  }, [direTeam, direPlayersRaw]);

  const proStats = heroStats.data || [];
  const heroConst = heroConstants.data || {};

  const allHeroes = useMemo(() => {
    return Object.values(heroConst).sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  }, [heroConst]);

  const usedHeroIds = useMemo(() => {
    const s = new Set<number>();
    [...draft.radiant_picks, ...draft.dire_picks, ...draft.radiant_bans, ...draft.dire_bans].forEach((id) => { if (id) s.add(id); });
    return s;
  }, [draft]);

  const filteredHeroes = useMemo(() => {
    return allHeroes.filter((h) => {
      if (usedHeroIds.has(h.id)) return false;
      if (heroSearch && !h.localized_name.toLowerCase().includes(heroSearch.toLowerCase())) return false;
      if (attrFilter !== 'all' && h.primary_attr !== attrFilter) return false;
      if (roleFilter !== 'all' && !h.roles.includes(roleFilter)) return false;
      return true;
    });
  }, [allHeroes, heroSearch, attrFilter, roleFilter, usedHeroIds]);

  function selectHero(heroId: number) {
    if (!selectedSlot) return;
    setDraft((prev) => {
      const next = { ...prev };
      if (selectedSlot.type === 'radiant_pick') {
        const arr = [...prev.radiant_picks]; arr[selectedSlot.index] = heroId; next.radiant_picks = arr;
      } else if (selectedSlot.type === 'dire_pick') {
        const arr = [...prev.dire_picks]; arr[selectedSlot.index] = heroId; next.dire_picks = arr;
      } else if (selectedSlot.type === 'radiant_ban') {
        const arr = [...prev.radiant_bans]; arr[selectedSlot.index] = heroId; next.radiant_bans = arr;
      } else {
        const arr = [...prev.dire_bans]; arr[selectedSlot.index] = heroId; next.dire_bans = arr;
      }
      return next;
    });
    // Auto-advance
    const key = selectedSlot.type === 'radiant_pick' ? 'radiant_picks'
      : selectedSlot.type === 'dire_pick' ? 'dire_picks'
      : selectedSlot.type === 'radiant_ban' ? 'radiant_bans' : 'dire_bans';
    const arr = draft[key] as (number | null)[];
    const nextEmpty = arr.findIndex((v, i) => i > selectedSlot.index && v === null);
    if (nextEmpty !== -1) setSelectedSlot({ type: selectedSlot.type, index: nextEmpty });
    else setSelectedSlot(null);
  }

  function clearSlot(type: SlotType, index: number) {
    setDraft((prev) => {
      const next = { ...prev };
      if (type === 'radiant_pick') { const a = [...prev.radiant_picks]; a[index] = null; next.radiant_picks = a; }
      else if (type === 'dire_pick') { const a = [...prev.dire_picks]; a[index] = null; next.dire_picks = a; }
      else if (type === 'radiant_ban') { const a = [...prev.radiant_bans]; a[index] = null; next.radiant_bans = a; }
      else { const a = [...prev.dire_bans]; a[index] = null; next.dire_bans = a; }
      return next;
    });
    // Clear player assignment for pick slots
    if (type === 'radiant_pick') {
      setRadiantAssignments((prev) => { const a = [...prev]; a[index] = null; return a; });
    } else if (type === 'dire_pick') {
      setDireAssignments((prev) => { const a = [...prev]; a[index] = null; return a; });
    }
  }

  function clearAll() {
    setDraft(EMPTY_DRAFT);
    setSelectedSlot(null);
    setRadiantTeam(null);
    setDireTeam(null);
    setRadiantAssignments([...EMPTY_PLAYERS]);
    setDireAssignments([...EMPTY_PLAYERS]);
    setHeroSearch('');
  }

  const isLoading = heroStats.isLoading || heroConstants.isLoading;

  function DraftSide({ side }: { side: 'Radiant' | 'Dire' }) {
    const isRad = side === 'Radiant';
    const color = isRad ? 'var(--color-radiant)' : 'var(--color-dire)';
    const picks = isRad ? draft.radiant_picks : draft.dire_picks;
    const bans = isRad ? draft.radiant_bans : draft.dire_bans;
    const pickType: SlotType = isRad ? 'radiant_pick' : 'dire_pick';
    const banType: SlotType = isRad ? 'radiant_ban' : 'dire_ban';
    const players = isRad ? radiantPlayers : direPlayers;
    const assignments = isRad ? radiantAssignments : direAssignments;
    const setAssignment = isRad
      ? (i: number, v: number | null) => setRadiantAssignments((prev) => { const a = [...prev]; a[i] = v; return a; })
      : (i: number, v: number | null) => setDireAssignments((prev) => { const a = [...prev]; a[i] = v; return a; });
    const team = isRad ? radiantTeam : direTeam;
    const setTeam = isRad ? setRadiantTeam : setDireTeam;

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Team picker */}
        <TeamPicker side={side} team={team} onSelect={setTeam} />

        <div style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {side}
        </div>

        {/* Picks */}
        <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Picks</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
          {picks.map((heroId, i) => {
            const sel = selectedSlot?.type === pickType && selectedSlot.index === i;
            return (
              <PickSlotWithPlayer
                key={i}
                heroId={heroId}
                selected={sel}
                onSlotClick={() => { if (sel) setSelectedSlot(null); else setSelectedSlot({ type: pickType, index: i }); }}
                onClear={() => clearSlot(pickType, i)}
                assignedPlayerId={assignments[i]}
                onAssignPlayer={(v) => setAssignment(i, v)}
                players={players}
              />
            );
          })}
        </div>

        {/* Bans */}
        <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bans</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {bans.map((heroId, i) => {
            const sel = selectedSlot?.type === banType && selectedSlot.index === i;
            return (
              <div key={i} style={{ position: 'relative' }}>
                <HeroSlot
                  heroId={heroId}
                  size={48}
                  isban
                  selected={sel}
                  onClick={() => { if (sel) setSelectedSlot(null); else setSelectedSlot({ type: banType, index: i }); }}
                />
                {heroId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearSlot(banType, i); }}
                    style={{ position: 'absolute', top: -4, right: -4, width: 13, height: 13, borderRadius: '50%', background: 'var(--color-dire)', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '6px' }}>
            Live Draft Analyzer
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
            Set teams, input picks &amp; bans as they happen — get win rate analysis instantly.
            {' '}<span style={{ color: 'var(--color-dim)' }}>Win rates from recent pro matches.</span>
          </p>
        </div>
        <button
          onClick={clearAll}
          style={{
            padding: '10px 22px',
            borderRadius: 8,
            border: '2px solid #c0392b',
            background: 'rgba(192,57,43,0.15)',
            color: '#e74c3c',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(192,57,43,0.28)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(192,57,43,0.15)')}
        >
          New Draft / Clear All
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading hero data...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Draft board */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <DraftSide side="Radiant" />
              <div style={{ width: 1, background: 'var(--color-border)', alignSelf: 'stretch' }} />
              <DraftSide side="Dire" />
            </div>

            <div style={{ marginTop: '16px', padding: '8px 12px', background: 'rgba(201,162,39,0.08)', borderRadius: 6, fontSize: '12px', color: 'var(--color-muted)' }}>
              {selectedSlot
                ? `Selecting: ${selectedSlot.type.replace(/_/g, ' ')} slot ${selectedSlot.index + 1} — Click a hero below`
                : 'Click a slot to select it, then click a hero to assign. Click × to remove. Use team search to enable player assignment.'}
            </div>
          </div>

          {/* Hero picker */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search hero..."
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  width: 180,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 3 }}>
                <SmallBtn active={attrFilter === 'all'} onClick={() => setAttrFilter('all')}>All</SmallBtn>
                {ATTRS.map((a) => (
                  <SmallBtn key={a.key} active={attrFilter === a.key} onClick={() => setAttrFilter(a.key)} color={a.color}>{a.label}</SmallBtn>
                ))}
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card)',
                  color: 'var(--color-text)',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--color-muted)', marginLeft: 'auto' }}>{filteredHeroes.length} heroes</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '340px', overflowY: 'auto' }}>
              {filteredHeroes.map((h) => {
                const stats = proStats.find((s) => s.id === h.id);
                const wr = stats && stats.pro_pick >= 3 ? (stats.pro_win / stats.pro_pick) * 100 : null;
                const isSelected = selectedSlot !== null;
                return (
                  <div
                    key={h.id}
                    onClick={() => { if (isSelected) selectHero(h.id); }}
                    title={`${h.localized_name}${wr !== null ? ` — ${wr.toFixed(1)}% WR` : ''}`}
                    style={{
                      cursor: isSelected ? 'pointer' : 'default',
                      opacity: isSelected ? 1 : 0.85,
                      position: 'relative',
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: `1px solid ${isSelected ? 'rgba(201,162,39,0.3)' : 'var(--color-border)'}`,
                      transition: 'transform 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={(e) => { if (isSelected) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.05)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
                  >
                    <Image
                      src={getHeroImageUrl(h.name)}
                      alt={h.localized_name}
                      width={60}
                      height={34}
                      style={{ display: 'block', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                    {wr !== null && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        fontSize: 8, textAlign: 'center',
                        background: `rgba(${wr >= 55 ? '77,186,135' : wr >= 45 ? '180,140,0' : '192,57,43'},0.85)`,
                        color: '#fff', fontWeight: 700, padding: '1px',
                      }}>
                        {wr.toFixed(0)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px', color: 'var(--color-text)' }}>
              Draft Analysis
              <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 400, marginLeft: 8 }}>
                win rates from pro matches (OpenDota global stats)
              </span>
            </div>
            <AnalysisPanel
              draft={draft}
              proStats={proStats}
              heroConst={heroConst}
              radiantPlayers={radiantPlayers}
              direPlayers={direPlayers}
              radiantAssignments={radiantAssignments}
              direAssignments={direAssignments}
            />
          </div>

        </div>
      )}
    </div>
  );
}

function SmallBtn({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 5,
        border: `1px solid ${active ? (color || 'var(--color-gold)') : 'var(--color-border)'}`,
        background: active ? `rgba(${color ? '255,255,255' : '201,162,39'},0.08)` : 'transparent',
        color: active ? (color || 'var(--color-gold-bright)') : 'var(--color-muted)',
        fontSize: 12,
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
