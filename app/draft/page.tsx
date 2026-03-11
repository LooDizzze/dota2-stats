'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { getHeroImageUrl, getProHeroStats, getAllTeams, getTeamPlayers } from '@/lib/opendota';
import { ProHeroStat, Team } from '@/lib/types';

const ROLES = ['Carry', 'Support', 'Nuker', 'Disabler', 'Initiator', 'Jungler', 'Durable', 'Escape', 'Pusher'];

const ATTR_DEFS = [
  { key: 'str', label: 'Strength',     color: '#e05555', icon: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_str.png' },
  { key: 'agi', label: 'Agility',      color: '#4dba87', icon: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_agi.png' },
  { key: 'int', label: 'Intelligence', color: '#5f9de0', icon: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_int.png' },
  { key: 'all', label: 'Universal',    color: '#c49cde', icon: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_all.png' },
] as const;

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

function TeamPicker({ side, team, onSelect }: {
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
        <button onClick={() => onSelect(null)} style={{ fontSize: 11, color: 'var(--color-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', padding: '1px 6px', marginLeft: 2 }}>
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
        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${color}50`, background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 12, width: 190, outline: 'none' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 6, width: 230, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 2 }}>
          {filtered.map((t) => (
            <div key={t.team_id} onClick={() => { onSelect(t); setSearch(''); setOpen(false); }}
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

function HeroImg({ heroId, size }: { heroId: number; size: number }) {
  const { heroConstants } = useHeroData();
  const h = heroConstants.data ? Object.values(heroConstants.data).find((x) => x.id === heroId) : null;
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

function HeroSlot({ heroId, size, label, onClick, selected, isban }: {
  heroId: number | null; size: number; label?: string;
  onClick?: () => void; selected?: boolean; isban?: boolean;
}) {
  return (
    <div onClick={onClick} title={label} style={{
      width: size, height: Math.round(size * 0.56),
      border: selected ? '2px solid var(--color-gold)' : `2px solid ${isban ? 'rgba(192,57,43,0.4)' : 'rgba(77,186,135,0.4)'}`,
      borderRadius: 4, background: heroId ? 'transparent' : 'rgba(26,39,64,0.7)',
      cursor: onClick ? 'pointer' : 'default', overflow: 'hidden', position: 'relative',
      opacity: isban && heroId ? 0.5 : 1, flexShrink: 0,
      boxShadow: selected ? '0 0 8px rgba(201,162,39,0.4)' : 'none',
    }}>
      {heroId ? <HeroImg heroId={heroId} size={size} /> : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: Math.max(8, size * 0.18), color: 'var(--color-dim)', fontWeight: 700 }}>{isban ? 'BAN' : 'PICK'}</span>
        </div>
      )}
    </div>
  );
}

function PickSlotWithPlayer({ heroId, selected, onSlotClick, onClear, assignedPlayerId, onAssignPlayer, players }: {
  heroId: number | null; selected: boolean;
  onSlotClick: () => void; onClear: () => void;
  assignedPlayerId: number | null; onAssignPlayer: (v: number | null) => void;
  players: TeamPlayer[] | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ position: 'relative' }}>
        <HeroSlot heroId={heroId} size={72} isban={false} selected={selected} onClick={onSlotClick} />
        {heroId && (
          <button onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-dire)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            ×
          </button>
        )}
      </div>
      {players !== null && heroId && (
        <select value={assignedPlayerId ?? ''} onChange={(e) => onAssignPlayer(e.target.value ? Number(e.target.value) : null)}
          onClick={(e) => e.stopPropagation()} title="Assign player"
          style={{ width: 72, fontSize: 9, padding: '2px 2px', borderRadius: 3, border: `1px solid ${assignedPlayerId ? 'var(--color-gold)' : 'var(--color-border)'}`, background: assignedPlayerId ? 'rgba(201,162,39,0.1)' : 'var(--color-bg)', color: assignedPlayerId ? 'var(--color-gold-bright)' : 'var(--color-muted)', cursor: 'pointer', outline: 'none', textOverflow: 'ellipsis' }}>
          <option value="">— player —</option>
          {players.map((p) => <option key={p.account_id} value={p.account_id}>{p.name || `#${p.account_id}`}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── Analysis Panel ────────────────────────────────────────────────────────────

function AnalysisPanel({ draft, proStats, heroConst, radiantPlayers, direPlayers, radiantAssignments, direAssignments }: {
  draft: Draft; proStats: ProHeroStat[];
  heroConst: Record<string, { id: number; name: string; localized_name: string; primary_attr: string; roles: string[] }>;
  radiantPlayers: TeamPlayer[] | null; direPlayers: TeamPlayer[] | null;
  radiantAssignments: (number | null)[]; direAssignments: (number | null)[];
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
      if (!id) continue;
      const wr = heroWinRate(id);
      if (wr !== null) { total += wr; count++; }
    }
    return { score: count > 0 ? total / count : 0, rated: count };
  }

  const radScore = sideScore(draft.radiant_picks);
  const direScore = sideScore(draft.dire_picks);
  const hasAny = draft.radiant_picks.some(Boolean) || draft.dire_picks.some(Boolean);

  function SideAnalysis({ side, picks, players, assignments }: {
    side: 'Radiant' | 'Dire'; picks: (number | null)[];
    players: TeamPlayer[] | null; assignments: (number | null)[];
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
            if (!id) return <div key={i} style={{ height: 28, background: 'rgba(26,39,64,0.4)', borderRadius: 4, border: '1px solid var(--color-border)' }} />;
            const wr = heroWinRate(id);
            const h = constById[id];
            const heroName = h?.localized_name || `Hero #${id}`;
            const playerObj = players?.find((p) => p.account_id === assignments[i]);
            const playerName = playerObj?.name || (assignments[i] ? `#${assignments[i]}` : null);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'var(--color-card-hover)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroName}</div>
                  {playerName && <div style={{ fontSize: 10, color: 'var(--color-gold)', fontWeight: 600, marginTop: 1 }}>{playerName}</div>}
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
                ) : <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>No data</span>}
              </div>
            );
          })}
        </div>
        {score.rated > 0 && (
          <div style={{ padding: '10px 12px', background: 'var(--color-card)', borderRadius: 6, border: '1px solid var(--color-border)', marginBottom: '12px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Avg Win Rate</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: score.score >= 55 ? '#4dba87' : score.score >= 45 ? '#f0c040' : '#e74c3c' }}>{score.score.toFixed(1)}%</div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>based on {score.rated} rated hero{score.rated !== 1 ? 's' : ''}</div>
          </div>
        )}
        {Object.keys(roles).length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Roles</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(roles).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                <span key={role} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(26,39,64,0.8)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  {role}{count > 1 ? ` ×${count}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!hasAny) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px' }}>Select heroes above to see analysis</div>;
  }

  const advantage = radScore.score - direScore.score;

  return (
    <div>
      {radScore.rated > 0 && direScore.rated > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Draft Advantage</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: 'var(--color-radiant)', fontWeight: 700, fontSize: 16, minWidth: 48 }}>{radScore.score.toFixed(1)}%</span>
            <div style={{ flex: 1, height: 12, background: 'var(--color-border)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(radScore.score / (radScore.score + direScore.score)) * 100}%`, background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)', borderRadius: '6px 0 0 6px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ color: 'var(--color-dire)', fontWeight: 700, fontSize: 16, minWidth: 48, textAlign: 'right' }}>{direScore.score.toFixed(1)}%</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-muted)' }}>
            {Math.abs(advantage) < 2 ? 'Even draft' : advantage > 0 ? `Radiant advantage (+${advantage.toFixed(1)}%)` : `Dire advantage (+${(-advantage).toFixed(1)}%)`}
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

// ─── Hero Picker Card (attribute grid) ─────────────────────────────────────────

function HeroPickerCard({ hero, stat, isSelected, usedIds, onClick }: {
  hero: { id: number; name: string; localized_name: string; primary_attr: string; roles: string[] };
  stat: ProHeroStat | undefined;
  isSelected: boolean;
  usedIds: Set<number>;
  onClick: () => void;
}) {
  const used = usedIds.has(hero.id);
  const wr = stat && stat.pro_pick >= 3 ? (stat.pro_win / stat.pro_pick) * 100 : null;
  const picks = stat?.pro_pick ?? 0;
  const bans = stat?.pro_ban ?? 0;

  return (
    <div
      onClick={used ? undefined : onClick}
      title={`${hero.localized_name}${wr !== null ? ` — ${wr.toFixed(1)}% WR (${picks}P / ${bans}B)` : ''}`}
      style={{
        position: 'relative',
        width: 62,
        height: 35,
        borderRadius: 3,
        overflow: 'hidden',
        cursor: used ? 'default' : (isSelected ? 'pointer' : 'default'),
        opacity: used ? 0.2 : 1,
        border: `1px solid ${isSelected ? 'rgba(201,162,39,0.5)' : 'rgba(26,39,64,0.8)'}`,
        flexShrink: 0,
        transition: 'opacity 0.15s, transform 0.1s',
      }}
      onMouseEnter={(e) => { if (!used && isSelected) (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; }}
    >
      <Image
        src={getHeroImageUrl(hero.name)}
        alt={hero.localized_name}
        width={62}
        height={35}
        style={{ display: 'block', objectFit: 'cover' }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
      />

      {/* Pick count bottom-left */}
      {picks > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, fontSize: 8, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.65)', padding: '1px 3px', lineHeight: 1.3 }}>
          <span style={{ color: '#5f9de0' }}>●</span> {picks}
        </div>
      )}
      {/* Ban count bottom-right */}
      {bans > 0 && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 8, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.65)', padding: '1px 3px', lineHeight: 1.3 }}>
          {bans} <span style={{ color: '#e05555' }}>▲</span>
        </div>
      )}

      {/* Win rate bar at bottom (thin line) */}
      {wr !== null && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: `rgba(${wr >= 55 ? '77,186,135' : wr >= 45 ? '200,160,0' : '192,57,43'},0.9)` }} />
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const { heroStats, heroConstants } = useHeroData();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [selectedSlot, setSelectedSlot] = useState<{ type: SlotType; index: number } | null>(null);
  const [heroSearch, setHeroSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [radiantTeam, setRadiantTeam] = useState<Team | null>(null);
  const [direTeam, setDireTeam] = useState<Team | null>(null);
  const [radiantAssignments, setRadiantAssignments] = useState<(number | null)[]>([...EMPTY_PLAYERS]);
  const [direAssignments, setDireAssignments] = useState<(number | null)[]>([...EMPTY_PLAYERS]);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);

  // Load draft imported from a match page
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dota2stats_draft_import');
      if (!raw) return;
      localStorage.removeItem('dota2stats_draft_import');
      const data = JSON.parse(raw);
      setDraft({
        radiant_picks: (data.radiant_picks || [null,null,null,null,null]).slice(0, 5),
        dire_picks:    (data.dire_picks    || [null,null,null,null,null]).slice(0, 5),
        radiant_bans:  (data.radiant_bans  || Array(7).fill(null)).slice(0, 7),
        dire_bans:     (data.dire_bans     || Array(7).fill(null)).slice(0, 7),
      });
      const label = [data.radiant_name, data.dire_name].filter(Boolean).join(' vs ');
      if (label) setImportedFrom(label);
    } catch {
      // ignore parse errors
    }
  }, []);

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

  const radiantPlayers = useMemo<TeamPlayer[] | null>(() => {
    if (!radiantTeam || !radiantPlayersRaw) return null;
    const current = (radiantPlayersRaw as TeamPlayer[]).filter((p) => p.is_current_team_member);
    return current.length > 0 ? current : (radiantPlayersRaw as TeamPlayer[]).slice(0, 10);
  }, [radiantTeam, radiantPlayersRaw]);

  const direPlayers = useMemo<TeamPlayer[] | null>(() => {
    if (!direTeam || !direPlayersRaw) return null;
    const current = (direPlayersRaw as TeamPlayer[]).filter((p) => p.is_current_team_member);
    return current.length > 0 ? current : (direPlayersRaw as TeamPlayer[]).slice(0, 10);
  }, [direTeam, direPlayersRaw]);

  const proStats = heroStats.data || [];
  const heroConst = heroConstants.data || {};

  // All heroes sorted by localized_name within each attr group
  const allHeroes = useMemo(() => {
    return Object.values(heroConst).sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  }, [heroConst]);

  const usedHeroIds = useMemo(() => {
    const s = new Set<number>();
    [...draft.radiant_picks, ...draft.dire_picks, ...draft.radiant_bans, ...draft.dire_bans].forEach((id) => { if (id) s.add(id); });
    return s;
  }, [draft]);

  const statsById = useMemo(() => {
    const m: Record<number, ProHeroStat> = {};
    proStats.forEach((h) => { m[h.id] = h; });
    return m;
  }, [proStats]);

  // Heroes grouped by attr, filtered by search/role (but NOT removed if used — shown as faded)
  const heroByAttr = useMemo(() => {
    const groups: Record<string, typeof allHeroes> = { str: [], agi: [], int: [], all: [] };
    for (const h of allHeroes) {
      const q = heroSearch.toLowerCase();
      if (q && !h.localized_name.toLowerCase().includes(q)) continue;
      if (roleFilter !== 'all' && !h.roles.includes(roleFilter)) continue;
      const attr = h.primary_attr in groups ? h.primary_attr : 'all';
      groups[attr].push(h);
    }
    return groups;
  }, [allHeroes, heroSearch, roleFilter]);

  const totalVisible = ATTR_DEFS.reduce((n, a) => n + heroByAttr[a.key].length, 0);

  function selectHero(heroId: number) {
    if (!selectedSlot) return;
    setDraft((prev) => {
      const next = { ...prev };
      if (selectedSlot.type === 'radiant_pick') { const a = [...prev.radiant_picks]; a[selectedSlot.index] = heroId; next.radiant_picks = a; }
      else if (selectedSlot.type === 'dire_pick') { const a = [...prev.dire_picks]; a[selectedSlot.index] = heroId; next.dire_picks = a; }
      else if (selectedSlot.type === 'radiant_ban') { const a = [...prev.radiant_bans]; a[selectedSlot.index] = heroId; next.radiant_bans = a; }
      else { const a = [...prev.dire_bans]; a[selectedSlot.index] = heroId; next.dire_bans = a; }
      return next;
    });
    // Auto-advance to next empty slot
    const key = selectedSlot.type === 'radiant_pick' ? 'radiant_picks' : selectedSlot.type === 'dire_pick' ? 'dire_picks' : selectedSlot.type === 'radiant_ban' ? 'radiant_bans' : 'dire_bans';
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
    if (type === 'radiant_pick') setRadiantAssignments((prev) => { const a = [...prev]; a[index] = null; return a; });
    else if (type === 'dire_pick') setDireAssignments((prev) => { const a = [...prev]; a[index] = null; return a; });
  }

  function clearAll() {
    setDraft(EMPTY_DRAFT); setSelectedSlot(null);
    setRadiantTeam(null); setDireTeam(null);
    setRadiantAssignments([...EMPTY_PLAYERS]); setDireAssignments([...EMPTY_PLAYERS]);
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
        <TeamPicker side={side} team={team} onSelect={setTeam} />
        <div style={{ fontSize: '13px', fontWeight: 700, color, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{side}</div>

        <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Picks</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
          {picks.map((heroId, i) => {
            const sel = selectedSlot?.type === pickType && selectedSlot.index === i;
            return (
              <PickSlotWithPlayer key={i} heroId={heroId} selected={sel}
                onSlotClick={() => { if (sel) setSelectedSlot(null); else setSelectedSlot({ type: pickType, index: i }); }}
                onClear={() => clearSlot(pickType, i)}
                assignedPlayerId={assignments[i]} onAssignPlayer={(v) => setAssignment(i, v)} players={players}
              />
            );
          })}
        </div>

        <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginBottom: '5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bans</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {bans.map((heroId, i) => {
            const sel = selectedSlot?.type === banType && selectedSlot.index === i;
            return (
              <div key={i} style={{ position: 'relative' }}>
                <HeroSlot heroId={heroId} size={48} isban selected={sel}
                  onClick={() => { if (sel) setSelectedSlot(null); else setSelectedSlot({ type: banType, index: i }); }}
                />
                {heroId && (
                  <button onClick={(e) => { e.stopPropagation(); clearSlot(banType, i); }}
                    style={{ position: 'absolute', top: -4, right: -4, width: 13, height: 13, borderRadius: '50%', background: 'var(--color-dire)', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
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
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '6px' }}>Live Draft Analyzer</h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
            Set teams, input picks &amp; bans — win rate analysis from recent pro matches.
          </p>
        </div>
        <button onClick={clearAll} style={{ padding: '10px 22px', borderRadius: 8, border: '2px solid #c0392b', background: 'rgba(192,57,43,0.15)', color: '#e74c3c', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(192,57,43,0.28)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(192,57,43,0.15)')}>
          New Draft / Clear All
        </button>
      </div>

      {importedFrom && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(77,186,135,0.08)', border: '1px solid rgba(77,186,135,0.25)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--color-radiant)', fontWeight: 600 }}>⚔ Draft loaded: <span style={{ color: 'var(--color-text)', fontWeight: 400 }}>{importedFrom}</span></span>
          <button onClick={() => setImportedFrom(null)} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Loading hero data...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Draft board */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <DraftSide side="Radiant" />
              <div style={{ width: 1, background: 'var(--color-border)', alignSelf: 'stretch' }} />
              <DraftSide side="Dire" />
            </div>
            <div style={{ marginTop: '14px', padding: '8px 12px', background: 'rgba(201,162,39,0.08)', borderRadius: 6, fontSize: '12px', color: selectedSlot ? 'var(--color-gold)' : 'var(--color-muted)' }}>
              {selectedSlot
                ? `Selecting: ${selectedSlot.type.replace(/_/g, ' ')} slot ${selectedSlot.index + 1} — click a hero below`
                : 'Click a Pick or Ban slot, then click a hero to assign it. Numbers on heroes = pro picks (blue) / bans (red).'}
            </div>
          </div>

          {/* Hero picker — Dota 2 attribute grid */}
          <div className="card" style={{ padding: '14px 16px' }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search hero..."
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, width: 160, outline: 'none' }}
              />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                <option value="all">All Roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 'auto' }}>
                {totalVisible} heroes
              </span>
            </div>

            {/* 4-column attribute layout — grid ensures each column wraps correctly */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) 220px', gap: '12px', alignItems: 'start' }}>
              {ATTR_DEFS.map(({ key, label, color, icon }) => {
                const heroes = heroByAttr[key];
                return (
                  <div key={key} style={{ minWidth: 0 }}>
                    {/* Attribute header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${color}40` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={icon} alt={label} width={14} height={14} style={{ imageRendering: 'crisp-edges' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color, textTransform: 'uppercase' }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--color-dim)', marginLeft: 'auto' }}>{heroes.length}</span>
                    </div>
                    {/* Hero grid */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {heroes.map((h) => (
                        <HeroPickerCard
                          key={h.id}
                          hero={h}
                          stat={statsById[h.id]}
                          isSelected={selectedSlot !== null}
                          usedIds={usedHeroIds}
                          onClick={() => { if (selectedSlot && !usedHeroIds.has(h.id)) selectHero(h.id); }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px', color: 'var(--color-text)' }}>
              Draft Analysis
              <span style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 400, marginLeft: 8 }}>win rates from pro matches (OpenDota global stats)</span>
            </div>
            <AnalysisPanel draft={draft} proStats={proStats} heroConst={heroConst}
              radiantPlayers={radiantPlayers} direPlayers={direPlayers}
              radiantAssignments={radiantAssignments} direAssignments={direAssignments}
            />
          </div>

        </div>
      )}
    </div>
  );
}
