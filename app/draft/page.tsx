'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { getHeroImageUrl, getProHeroStats, getAllTeams, getTeamPlayers } from '@/lib/opendota';
import { ProHeroStat, Team } from '@/lib/types';

// ─── ML Prediction ──────────────────────────────────────────────────────────────

interface MLPredictResult {
  radiant_win_prob: number;
  dire_win_prob: number;
  has_team_data: boolean;
  features_used: Record<string, number>;
}

async function fetchMLPredict(
  radiantHeroIds: number[],
  direHeroIds: number[],
  radiantTeamId?: number,
  direTeamId?: number,
): Promise<MLPredictResult> {
  const res = await fetch('/api/ml-predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      radiant_hero_ids: radiantHeroIds,
      dire_hero_ids: direHeroIds,
      radiant_team_id: radiantTeamId ?? null,
      dire_team_id: direTeamId ?? null,
    }),
  });
  if (!res.ok) throw new Error('ML service unavailable');
  return res.json();
}

// Generates human-readable reasons based on top features
function getBetReasons(f: Record<string, number>, radiantFavored: boolean): string[] {
  const reasons: string[] = [];

  const wradv = f['radiant_winrate_advantage'];
  if (wradv !== undefined && Math.abs(wradv) > 0.05) {
    if (wradv > 0) reasons.push(`Radiant better form: +${(wradv * 100).toFixed(0)}% winrate advantage`);
    else reasons.push(`Dire better form: +${(Math.abs(wradv) * 100).toFixed(0)}% winrate advantage`);
  }

  const radWR = f['radiant_recent_winrate'];
  const direWR = f['dire_recent_winrate'];
  if (radWR !== undefined && radWR !== 0.5 && direWR !== undefined && direWR !== 0.5) {
    if (radiantFavored && radWR > 0.5)
      reasons.push(`Radiant on hot streak (${(radWR * 100).toFixed(0)}% recent WR)`);
    else if (!radiantFavored && direWR > 0.5)
      reasons.push(`Dire on hot streak (${(direWR * 100).toFixed(0)}% recent WR)`);
  }

  const radDispel = f['radiant_basic_dispel_count'] ?? 0;
  const dirDispel = f['dire_strong_dispel_count'] ?? 0;
  if (radDispel > 0 && radiantFavored)
    reasons.push(`Radiant draft has ${radDispel} dispel hero${radDispel > 1 ? 's' : ''} (key stat)`);
  if (dirDispel > 0 && !radiantFavored)
    reasons.push(`Dire draft has ${dirDispel} strong dispel hero${dirDispel > 1 ? 's' : ''}`);

  const radMeta = f['radiant_meta_score'] ?? 0.5;
  const direMeta = f['dire_meta_score'] ?? 0.5;
  if (Math.abs(radMeta - direMeta) > 0.03) {
    if (radMeta > direMeta && radiantFavored)
      reasons.push(`Radiant heroes more meta (avg WR ${(radMeta * 100).toFixed(1)}% vs ${(direMeta * 100).toFixed(1)}%)`);
    else if (direMeta > radMeta && !radiantFavored)
      reasons.push(`Dire heroes more meta (avg WR ${(direMeta * 100).toFixed(1)}% vs ${(radMeta * 100).toFixed(1)}%)`);
  }

  const radSynergy = f['radiant_synergy_score'] ?? 0;
  const direSynergy = f['dire_synergy_score'] ?? 0;
  if (radSynergy > direSynergy && radiantFavored)
    reasons.push(`Radiant draft has stronger synergies (${radSynergy}/3)`);
  else if (direSynergy > radSynergy && !radiantFavored)
    reasons.push(`Dire draft has stronger synergies (${direSynergy}/3)`);

  const radMobility = f['dire_global_mobility_count'] ?? 0;
  if (radMobility > 1 && !radiantFavored)
    reasons.push(`Dire has ${radMobility} mobility heroes (map control)`);

  return reasons.slice(0, 4);
}

function MLPredictionPanel({
  radiantHeroIds, direHeroIds, radiantTeamId, direTeamId,
  radiantTeamName, direTeamName,
}: {
  radiantHeroIds: number[];
  direHeroIds: number[];
  radiantTeamId?: number;
  direTeamId?: number;
  radiantTeamName?: string;
  direTeamName?: string;
}) {
  const [oddsInput, setOddsInput] = useState('1.85');
  const [bankroll, setBankroll] = useState('100');
  const hasAnyPick = radiantHeroIds.length > 0 || direHeroIds.length > 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ml-predict', radiantHeroIds, direHeroIds, radiantTeamId, direTeamId],
    queryFn: () => fetchMLPredict(radiantHeroIds, direHeroIds, radiantTeamId, direTeamId),
    enabled: hasAnyPick,
    staleTime: 0,
    retry: false,
  });

  const allPicked = radiantHeroIds.length === 5 && direHeroIds.length === 5;
  const radPct = data ? Math.round(data.radiant_win_prob * 100) : null;
  const direPct = data ? Math.round(data.dire_win_prob * 100) : null;

  // Betting math
  const betInfo = useMemo(() => {
    if (!data) return null;
    const p = data.radiant_win_prob;
    const radiantFavored = p >= 0.5;
    const favProb = radiantFavored ? p : 1 - p;
    const favName = radiantFavored ? (radiantTeamName || 'Radiant') : (direTeamName || 'Dire');
    const favColor = radiantFavored ? 'var(--color-radiant)' : 'var(--color-dire)';

    const odds = parseFloat(oddsInput) || 1.85;
    const bank = parseFloat(bankroll) || 100;
    const b = odds - 1; // net odds
    const q = 1 - favProb;

    const ev = favProb * odds - 1;
    const breakEvenOdds = 1 / favProb;

    // Kelly: f* = (b*p - q) / b
    const kellyFrac = b > 0 ? Math.max(0, (b * favProb - q) / b) : 0;
    const halfKellyFrac = kellyFrac / 2;
    const kellyAmount = +(kellyFrac * bank).toFixed(2);
    const halfKellyAmount = +(halfKellyFrac * bank).toFixed(2);

    const SKIP_THRESHOLD = 0.54;
    const reasons = getBetReasons(data.features_used, radiantFavored);

    return { favProb, favName, favColor, breakEvenOdds, ev, kellyFrac, halfKellyFrac, kellyAmount, halfKellyAmount, radiantFavored, reasons, skip: favProb < SKIP_THRESHOLD, odds, bank };
  }, [data, radiantTeamName, direTeamName, oddsInput, bankroll]);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
          ML Win Prediction
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 400 }}>
          CatBoost model · Wald TOP-15 features
        </span>
        {!allPicked && hasAnyPick && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(201,162,39,0.15)', color: 'var(--color-gold)', border: '1px solid rgba(201,162,39,0.3)', marginLeft: 'auto' }}>
            partial draft ({radiantHeroIds.length + direHeroIds.length}/10 picks)
          </span>
        )}
      </div>

      {!hasAnyPick ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
          Pick heroes above to get a prediction
        </div>
      ) : isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
          Computing prediction...
        </div>
      ) : isError ? (
        <div style={{ padding: '16px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, fontSize: 13, color: '#e74c3c' }}>
          ML service unavailable — start predict_api.py first
        </div>
      ) : data && radPct !== null && direPct !== null && betInfo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Probability bar */}
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: 'var(--color-radiant)', fontWeight: 800, fontSize: 22, minWidth: 52 }}>{radPct}%</span>
              <div style={{ flex: 1, height: 14, background: 'var(--color-border)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${data.radiant_win_prob * 100}%`,
                  background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)',
                  borderRadius: '7px 0 0 7px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ color: 'var(--color-dire)', fontWeight: 800, fontSize: 22, minWidth: 52, textAlign: 'right' }}>{direPct}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)' }}>
              <span style={{ color: 'var(--color-radiant)', fontWeight: 600 }}>RADIANT</span>
              <span>{radPct === direPct ? 'Even match' : radPct > direPct ? `Radiant favored +${radPct - direPct}%` : `Dire favored +${direPct - radPct}%`}</span>
              <span style={{ color: 'var(--color-dire)', fontWeight: 600 }}>DIRE</span>
            </div>
          </div>

          {/* Bet recommendation */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 12 }}>
              Betting Recommendation
            </div>

            {/* Inputs: odds + bankroll */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bookmaker odds</span>
                <input
                  type="number"
                  min="1.01" max="50" step="0.01"
                  value={oddsInput}
                  onChange={(e) => setOddsInput(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, fontWeight: 700, width: '100%', outline: 'none' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bankroll ($)</span>
                <input
                  type="number"
                  min="1" step="1"
                  value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, fontWeight: 700, width: '100%', outline: 'none' }}
                />
              </label>
            </div>

            {betInfo.skip ? (
              <div style={{ padding: '14px 16px', background: 'rgba(26,39,64,0.7)', borderRadius: 8, border: '1px solid var(--color-border)', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-muted)', marginBottom: 4 }}>SKIP THIS BET</div>
                <div style={{ fontSize: 12, color: 'var(--color-dim)' }}>
                  Model confidence {Math.round(betInfo.favProb * 100)}% — too close to 50/50 for positive EV
                </div>
              </div>
            ) : betInfo.ev <= 0 ? (
              <div style={{ padding: '14px 16px', background: 'rgba(192,57,43,0.08)', borderRadius: 8, border: '1px solid rgba(192,57,43,0.25)', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#e74c3c', marginBottom: 4 }}>NEGATIVE EV</div>
                <div style={{ fontSize: 12, color: 'var(--color-dim)' }}>
                  At {betInfo.odds} odds EV = {(betInfo.ev * 100).toFixed(1)}% · Min odds for +EV: <strong style={{ color: 'var(--color-gold)' }}>{betInfo.breakEvenOdds.toFixed(2)}</strong>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {/* Main call */}
                <div style={{ flex: 1, minWidth: 160, padding: '14px 16px', background: `rgba(${betInfo.radiantFavored ? '77,186,135' : '192,57,43'},0.1)`, borderRadius: 8, border: `1px solid ${betInfo.radiantFavored ? 'rgba(77,186,135,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bet on</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: betInfo.favColor, marginBottom: 4 }}>{betInfo.favName}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Win prob: <strong style={{ color: betInfo.favColor }}>{Math.round(betInfo.favProb * 100)}%</strong></div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>EV: <strong style={{ color: '#4dba87' }}>+{(betInfo.ev * 100).toFixed(1)}%</strong></div>
                </div>

                {/* Kelly sizing */}
                <div style={{ flex: 1, minWidth: 160, padding: '14px 16px', background: 'rgba(26,39,64,0.5)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bet size (Kelly)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Full Kelly:</span>
                      <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--color-gold)' }}>${betInfo.kellyAmount}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>½ Kelly <span style={{ color: 'var(--color-radiant)', fontSize: 10 }}>recommended</span>:</span>
                      <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--color-radiant)' }}>${betInfo.halfKellyAmount}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--color-dim)' }}>Min odds for +EV:</span>
                      <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{betInfo.breakEvenOdds.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Reasons */}
            {betInfo.reasons.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Why</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {betInfo.reasons.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--color-text)' }}>
                      <span style={{ color: betInfo.favColor, fontWeight: 700, marginTop: 1 }}>›</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div style={{ fontSize: 11, color: 'var(--color-dim)', padding: '8px 10px', background: 'rgba(26,39,64,0.5)', borderRadius: 5, borderLeft: '2px solid var(--color-border)' }}>
            {data.has_team_data
              ? 'Team winrate data from local DB included.'
              : 'No team history in DB — winrate features use defaults. Select teams for better accuracy.'}
            {!allPicked && ' Partial draft — prediction will change as more heroes are picked.'}
            {' Model accuracy: ~58.5% on test data. Bet responsibly.'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

// ─── CM Draft sequence (Radiant starts) ────────────────────────────────────────
// R=Radiant, D=Dire  b=ban  p=pick
// Rban Dban Dban Rban Dban Dban Rban | Rpick Dpick | Rban Rban Dban | Dpick Rpick Rpick Dpick Dpick Rpick | Rban Dban Dban Rban | Rpick Dpick

type DraftTeam = 'radiant' | 'dire';
type DraftAction = 'pick' | 'ban';
interface DraftStep { team: DraftTeam; action: DraftAction; }

const DRAFT_SEQUENCE: DraftStep[] = [
  { team: 'radiant', action: 'ban'  }, // 0
  { team: 'dire',    action: 'ban'  }, // 1
  { team: 'dire',    action: 'ban'  }, // 2
  { team: 'radiant', action: 'ban'  }, // 3
  { team: 'dire',    action: 'ban'  }, // 4
  { team: 'dire',    action: 'ban'  }, // 5
  { team: 'radiant', action: 'ban'  }, // 6
  { team: 'radiant', action: 'pick' }, // 7
  { team: 'dire',    action: 'pick' }, // 8
  { team: 'radiant', action: 'ban'  }, // 9
  { team: 'radiant', action: 'ban'  }, // 10
  { team: 'dire',    action: 'ban'  }, // 11
  { team: 'dire',    action: 'pick' }, // 12
  { team: 'radiant', action: 'pick' }, // 13
  { team: 'radiant', action: 'pick' }, // 14
  { team: 'dire',    action: 'pick' }, // 15
  { team: 'dire',    action: 'pick' }, // 16
  { team: 'radiant', action: 'pick' }, // 17
  { team: 'radiant', action: 'ban'  }, // 18
  { team: 'dire',    action: 'ban'  }, // 19
  { team: 'dire',    action: 'ban'  }, // 20
  { team: 'radiant', action: 'ban'  }, // 21
  { team: 'radiant', action: 'pick' }, // 22
  { team: 'dire',    action: 'pick' }, // 23
];

// Indices in DRAFT_SEQUENCE for each slot type
const RAD_PICK_IDX  = DRAFT_SEQUENCE.map((s, i) => s.team === 'radiant' && s.action === 'pick'  ? i : -1).filter((i) => i >= 0);
const DIRE_PICK_IDX = DRAFT_SEQUENCE.map((s, i) => s.team === 'dire'    && s.action === 'pick'  ? i : -1).filter((i) => i >= 0);
const RAD_BAN_IDX   = DRAFT_SEQUENCE.map((s, i) => s.team === 'radiant' && s.action === 'ban'   ? i : -1).filter((i) => i >= 0);
const DIRE_BAN_IDX  = DRAFT_SEQUENCE.map((s, i) => s.team === 'dire'    && s.action === 'ban'   ? i : -1).filter((i) => i >= 0);

const EMPTY_PICKS: (number | null)[] = Array(24).fill(null);
const EMPTY_PLAYERS: (number | null)[] = [null, null, null, null, null];

// Legacy Draft type kept for AnalysisPanel compat
type SlotType = 'radiant_pick' | 'radiant_ban' | 'dire_pick' | 'dire_ban';
interface Draft {
  radiant_picks: (number | null)[];
  dire_picks: (number | null)[];
  radiant_bans: (number | null)[];
  dire_bans: (number | null)[];
}

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
      unoptimized
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
        unoptimized
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
  // picks[i] = heroId at DRAFT_SEQUENCE[i], null = not yet picked
  const [picks, setPicks] = useState<(number | null)[]>([...EMPTY_PICKS]);
  const [heroSearch, setHeroSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [radiantTeam, setRadiantTeam] = useState<Team | null>(null);
  const [direTeam, setDireTeam] = useState<Team | null>(null);
  const [firstPick, setFirstPick] = useState<'radiant' | 'dire'>('radiant');

  // When dire has first pick, invert radiant/dire in every step
  const sequence = useMemo(() =>
    firstPick === 'radiant'
      ? DRAFT_SEQUENCE
      : DRAFT_SEQUENCE.map((s) => ({ ...s, team: s.team === 'radiant' ? 'dire' : 'radiant' } as DraftStep)),
    [firstPick]
  );

  const radPickIdx  = useMemo(() => sequence.map((s, i) => s.team === 'radiant' && s.action === 'pick' ? i : -1).filter((i) => i >= 0), [sequence]);
  const direPickIdx = useMemo(() => sequence.map((s, i) => s.team === 'dire'    && s.action === 'pick' ? i : -1).filter((i) => i >= 0), [sequence]);
  const radBanIdx   = useMemo(() => sequence.map((s, i) => s.team === 'radiant' && s.action === 'ban'  ? i : -1).filter((i) => i >= 0), [sequence]);
  const direBanIdx  = useMemo(() => sequence.map((s, i) => s.team === 'dire'    && s.action === 'ban'  ? i : -1).filter((i) => i >= 0), [sequence]);

  // current step = first unfilled slot
  const currentStep = picks.findIndex((v) => v === null);
  const isDone = currentStep === -1;
  const step = isDone ? 24 : currentStep;
  const currentAction = isDone ? null : sequence[step];

  const proStats = heroStats.data || [];
  const heroConst = heroConstants.data || {};

  const allHeroes = useMemo(
    () => Object.values(heroConst).sort((a, b) => a.localized_name.localeCompare(b.localized_name)),
    [heroConst]
  );

  const usedHeroIds = useMemo(() => new Set(picks.filter(Boolean) as number[]), [picks]);

  const statsById = useMemo(() => {
    const m: Record<number, ProHeroStat> = {};
    proStats.forEach((h) => { m[h.id] = h; });
    return m;
  }, [proStats]);

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

  function pickHero(heroId: number) {
    if (isDone || usedHeroIds.has(heroId)) return;
    setPicks((prev) => { const next = [...prev]; next[step] = heroId; return next; });
  }

  function undo() {
    const lastFilled = [...picks].reverse().findIndex((v) => v !== null);
    if (lastFilled === -1) return;
    const idx = picks.length - 1 - lastFilled;
    setPicks((prev) => { const next = [...prev]; next[idx] = null; return next; });
  }

  function clearAll() {
    setPicks([...EMPTY_PICKS]);
    setHeroSearch('');
    setRadiantTeam(null);
    setDireTeam(null);
  }

  // Build legacy Draft object for AnalysisPanel
  const draft: Draft = useMemo(() => ({
    radiant_picks: radPickIdx.map((i) => picks[i]),
    dire_picks:    direPickIdx.map((i) => picks[i]),
    radiant_bans:  radBanIdx.map((i) => picks[i]),
    dire_bans:     direBanIdx.map((i) => picks[i]),
  }), [picks, radPickIdx, direPickIdx, radBanIdx, direBanIdx]);

  const isLoading = heroStats.isLoading || heroConstants.isLoading;
  const totalVisible = ATTR_DEFS.reduce((n, a) => n + heroByAttr[a.key].length, 0);

  // ── Draft Board ────────────────────────────────────────────────────────────

  function SlotBox({ seqIdx, size = 52 }: { seqIdx: number; size?: number }) {
    const heroId = picks[seqIdx];
    const s = sequence[seqIdx];
    const isCurrent = seqIdx === step && !isDone;
    const isBan = s.action === 'ban';
    const activeColor = s.team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';
    // eslint-disable-next-line react-hooks/exhaustive-deps

    return (
      <div
        title={heroId ? undefined : `Step ${seqIdx + 1}: ${s.team} ${s.action}`}
        style={{
          position: 'relative',
          width: size,
          height: size * 0.56,
          borderRadius: 3,
          overflow: 'hidden',
          border: isCurrent
            ? `2px solid ${activeColor}`
            : `1px solid ${heroId ? 'rgba(255,255,255,0.08)' : 'var(--color-border)'}`,
          background: heroId ? 'transparent' : isBan ? 'rgba(192,57,43,0.06)' : 'rgba(26,39,64,0.4)',
          boxShadow: isCurrent ? `0 0 10px ${activeColor}60` : 'none',
          flexShrink: 0,
          transition: 'box-shadow 0.2s',
        }}
      >
        {heroId ? (
          <>
            <Image
              src={getHeroImageUrl(Object.values(heroConst).find((h) => h.id === heroId)?.name || '')}
              alt=""
              width={size}
              height={Math.round(size * 0.56)}
              unoptimized
              style={{ display: 'block', objectFit: 'cover', filter: isBan ? 'grayscale(80%) brightness(0.55)' : 'none' }}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
            {isBan && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '70%', height: 2, background: 'rgba(192,57,43,0.9)', transform: 'rotate(-30deg)' }} />
              </div>
            )}
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isCurrent ? (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeColor, animation: 'pulse 1.2s ease-in-out infinite' }} />
            ) : (
              <div style={{ fontSize: 9, color: 'var(--color-dim)', fontWeight: 600 }}>{isBan ? '✕' : '+'}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  function DraftSideBoard({ team }: { team: 'radiant' | 'dire' }) {
    const isRad = team === 'radiant';
    const color = isRad ? 'var(--color-radiant)' : 'var(--color-dire)';
    const pickIdxs = isRad ? radPickIdx : direPickIdx;
    const banIdxs  = isRad ? radBanIdx  : direBanIdx;
    const teamObj  = isRad ? radiantTeam : direTeam;
    const setTeam  = isRad ? setRadiantTeam : setDireTeam;
    const label    = isRad ? 'Radiant' : 'Dire';

    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Team picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
          <TeamPicker side={label as 'Radiant' | 'Dire'} team={teamObj} onSelect={setTeam} />
        </div>

        {/* Picks row */}
        <div>
          <div style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>PICKS</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {pickIdxs.map((idx) => <SlotBox key={idx} seqIdx={idx} size={64} />)}
          </div>
        </div>

        {/* Bans row */}
        <div>
          <div style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>BANS</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {banIdxs.map((idx) => <SlotBox key={idx} seqIdx={idx} size={44} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text)', marginBottom: 4 }}>Draft Analyzer</h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Captain&apos;s Mode · click heroes in order</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* First pick toggle */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 700 }}>
            <button
              onClick={() => { setFirstPick('radiant'); setPicks([...EMPTY_PICKS]); }}
              style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', background: firstPick === 'radiant' ? 'rgba(77,186,135,0.18)' : 'var(--color-card)', color: firstPick === 'radiant' ? 'var(--color-radiant)' : 'var(--color-muted)', transition: 'all 0.15s' }}
            >
              Radiant FP
            </button>
            <button
              onClick={() => { setFirstPick('dire'); setPicks([...EMPTY_PICKS]); }}
              style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', background: firstPick === 'dire' ? 'rgba(192,57,43,0.18)' : 'var(--color-card)', color: firstPick === 'dire' ? 'var(--color-dire)' : 'var(--color-muted)', transition: 'all 0.15s', borderLeft: '1px solid var(--color-border)' }}
            >
              Dire FP
            </button>
          </div>
          <button onClick={undo} disabled={picks.every((v) => v === null)}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            ← Undo
          </button>
          <button onClick={clearAll}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(192,57,43,0.4)', background: 'rgba(192,57,43,0.12)', color: '#e74c3c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Reset
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>Loading hero data...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Draft board */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <DraftSideBoard team="radiant" />

              {/* Center: step indicator */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 28, minWidth: 90 }}>
                {isDone ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Draft</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Complete</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 4 }}>Step {step + 1}/24</div>
                    <div style={{
                      fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: currentAction!.team === 'radiant' ? 'var(--color-radiant)' : 'var(--color-dire)',
                    }}>
                      {currentAction!.team}
                    </div>
                    <div style={{
                      marginTop: 4, padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: currentAction!.action === 'ban' ? 'rgba(192,57,43,0.15)' : 'rgba(77,186,135,0.12)',
                      color: currentAction!.action === 'ban' ? '#e74c3c' : 'var(--color-radiant)',
                      border: `1px solid ${currentAction!.action === 'ban' ? 'rgba(192,57,43,0.3)' : 'rgba(77,186,135,0.25)'}`,
                    }}>
                      {currentAction!.action}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 9, color: 'var(--color-dim)', marginTop: 4 }}>
                  {step}/{24}
                </div>
              </div>

              <DraftSideBoard team="dire" />
            </div>
          </div>

          {/* Hero picker */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {!isDone && (
                <div style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: currentAction!.action === 'ban' ? 'rgba(192,57,43,0.12)' : 'rgba(77,186,135,0.1)',
                  color: currentAction!.action === 'ban' ? '#e74c3c' : 'var(--color-radiant)',
                  border: `1px solid ${currentAction!.action === 'ban' ? 'rgba(192,57,43,0.3)' : 'rgba(77,186,135,0.25)'}`,
                }}>
                  {currentAction!.team === 'radiant' ? 'Radiant' : 'Dire'} · {currentAction!.action.toUpperCase()}
                </div>
              )}
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
              <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 'auto' }}>{totalVisible} heroes</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) 220px', gap: 12, alignItems: 'start' }}>
              {ATTR_DEFS.map(({ key, label, color, icon }) => {
                const heroes = heroByAttr[key];
                return (
                  <div key={key} style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${color}40` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={icon} alt={label} width={14} height={14} style={{ imageRendering: 'crisp-edges' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color, textTransform: 'uppercase' }}>{label}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-dim)', marginLeft: 'auto' }}>{heroes.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {heroes.map((h) => (
                        <HeroPickerCard
                          key={h.id}
                          hero={h}
                          stat={statsById[h.id]}
                          isSelected={!isDone}
                          usedIds={usedHeroIds}
                          onClick={() => { if (!isDone && !usedHeroIds.has(h.id)) pickHero(h.id); }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: 'var(--color-text)' }}>
              Draft Analysis
              <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 400, marginLeft: 8 }}>pro match win rates</span>
            </div>
            <AnalysisPanel draft={draft} proStats={proStats} heroConst={heroConst}
              radiantPlayers={null} direPlayers={null}
              radiantAssignments={EMPTY_PLAYERS} direAssignments={EMPTY_PLAYERS}
            />
          </div>

          {/* ML Prediction */}
          <MLPredictionPanel
            radiantHeroIds={radPickIdx.map((i) => picks[i]).filter(Boolean) as number[]}
            direHeroIds={direPickIdx.map((i) => picks[i]).filter(Boolean) as number[]}
            radiantTeamId={radiantTeam?.team_id}
            direTeamId={direTeam?.team_id}
            radiantTeamName={radiantTeam?.name}
            direTeamName={direTeam?.name}
          />

        </div>
      )}
    </div>
  );
}
