'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { LiveMatch, HeroConstants } from '@/lib/types';
import { formatGameTime } from '@/lib/formatters';
import { getHeroImageUrl, getHeroConstants } from '@/lib/opendota';
import LoadingSpinner from '@/components/LoadingSpinner';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MLResult {
  radiant_win_prob: number;
  dire_win_prob: number;
  has_team_data: boolean;
}

type BetResult = 'pending' | 'won' | 'lost';

interface BetEntry {
  id: string;
  createdAt: number;
  matchTime: number;
  team1: string;
  team2: string;
  tournament: string;
  betOn: 'team1' | 'team2';
  team1Id?: number;
  team2Id?: number;
  mlProb: number;
  odds: number;
  amount: number;
  ev: number;
  result: BetResult;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function calcKelly(prob: number, odds: number, bankroll: number) {
  const b = odds - 1;
  const q = 1 - prob;
  const f = b > 0 ? Math.max(0, (b * prob - q) / b) : 0;
  return {
    fullKelly: +(f * bankroll).toFixed(2),
    halfKelly: +((f / 2) * bankroll).toFixed(2),
    ev: +(prob * odds - 1),
    frac: f,
  };
}

function loadBets(): BetEntry[] {
  try { return JSON.parse(localStorage.getItem('bets:v1') || '[]'); } catch { return []; }
}

function saveBets(bets: BetEntry[]) {
  try { localStorage.setItem('bets:v1', JSON.stringify(bets)); } catch {}
}

function getGoldColor(lead: number) {
  return lead > 0 ? 'var(--color-radiant)' : lead < 0 ? 'var(--color-dire)' : 'var(--color-muted)';
}

function formatLead(lead: number) {
  const abs = Math.abs(lead);
  const str = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs}`;
  return lead > 0 ? `Radiant +${str}` : lead < 0 ? `Dire +${str}` : 'Even';
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LiveMatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [oddsInput, setOddsInput] = useState('1.85');
  const [betOn, setBetOn] = useState<'team1' | 'team2'>('team1');
  const [bankroll, setBankroll] = useState(100);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const b = localStorage.getItem('bets:bankroll');
      if (b) setBankroll(parseFloat(b) || 100);
    } catch {}
  }, []);

  // Fetch all live matches, find this one
  const { data: liveMatches, isLoading: liveLoading } = useQuery<LiveMatch[]>({
    queryKey: ['live-matches-full'],
    queryFn: async () => {
      const r = await fetch('https://api.opendota.com/api/live');
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const match = useMemo(
    () => liveMatches?.find((m) => m.match_id === id),
    [liveMatches, id]
  );

  // Extract hero IDs from players
  const radiantHeroIds = useMemo(
    () => (match?.players || []).filter((p) => p.team === 0).map((p) => p.hero_id).filter(Boolean),
    [match]
  );
  const direHeroIds = useMemo(
    () => (match?.players || []).filter((p) => p.team === 1).map((p) => p.hero_id).filter(Boolean),
    [match]
  );

  // Hero constants for name lookup
  const { data: heroConstants } = useQuery<HeroConstants>({
    queryKey: ['hero-constants'],
    queryFn: getHeroConstants,
    staleTime: 60 * 60 * 1000,
  });

  const heroMap = useMemo(() => {
    if (!heroConstants) return {} as Record<number, string>;
    const map: Record<number, string> = {};
    Object.values(heroConstants).forEach((h) => { map[h.id] = h.name; });
    return map;
  }, [heroConstants]);

  // ML prediction
  const { data: mlData, isLoading: mlLoading } = useQuery<MLResult>({
    queryKey: ['ml-live', id, match?.team_id_radiant, match?.team_id_dire, radiantHeroIds.join(','), direHeroIds.join(',')],
    queryFn: async () => {
      const r = await fetch('/api/ml-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radiant_hero_ids: radiantHeroIds,
          dire_hero_ids: direHeroIds,
          radiant_team_id: match?.team_id_radiant || null,
          dire_team_id: match?.team_id_dire || null,
        }),
      });
      return r.json();
    },
    enabled: !!match,
    staleTime: 0,
    retry: false,
  });

  const odds = parseFloat(oddsInput) || 1.85;
  const radiantProb = mlData?.radiant_win_prob ?? 0.5;
  const direProb = mlData?.dire_win_prob ?? 0.5;
  const betProb = betOn === 'team1' ? radiantProb : direProb;
  const kelly = calcKelly(betProb, odds, bankroll);

  const radiant = match?.team_name_radiant || 'Radiant';
  const dire = match?.team_name_dire || 'Dire';
  const betOnName = betOn === 'team1' ? radiant : dire;

  function handleSaveBet() {
    if (!match) return;
    const bet: BetEntry = {
      id: uid(),
      createdAt: Date.now() / 1000,
      matchTime: Date.now() / 1000,
      team1: radiant,
      team2: dire,
      tournament: `League ${match.league_id}`,
      betOn,
      team1Id: match.team_id_radiant || undefined,
      team2Id: match.team_id_dire || undefined,
      mlProb: betProb,
      odds,
      amount: kelly.halfKelly,
      ev: kelly.ev,
      result: 'pending',
    };
    const bets = loadBets();
    saveBets([bet, ...bets]);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (liveLoading) return (
    <div style={{ paddingTop: 60 }}>
      <LoadingSpinner text="Fetching live match..." />
    </div>
  );

  if (!match) return (
    <div style={{ paddingTop: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 16, color: 'var(--color-muted)', marginBottom: 16 }}>Match not found or already ended.</div>
      <button onClick={() => router.push('/')} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 13 }}>
        ← Back to Home
      </button>
    </div>
  );

  const lead = match.radiant_lead;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Back */}
      <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        ← Back
      </button>

      {/* Match header */}
      <div className="card" style={{ padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span className="live-dot w-2 h-2 rounded-full bg-radiant inline-block" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-radiant)', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-radiant)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Now</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 'auto' }}>
            {formatGameTime(match.game_time)} · {match.spectators.toLocaleString()} watching
          </span>
        </div>

        {/* Teams & Score */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: lead >= 0 ? 'var(--color-radiant)' : 'var(--color-text)', lineHeight: 1.2 }}>{radiant}</div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>Radiant</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-text)', letterSpacing: '0.05em', lineHeight: 1 }}>
              {match.radiant_score} <span style={{ color: 'var(--color-dim)', fontSize: 20 }}>–</span> {match.dire_score}
            </div>
            <div style={{ fontSize: 11, marginTop: 6, fontWeight: 700, color: getGoldColor(lead) }}>
              {formatLead(lead)}
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: lead < 0 ? 'var(--color-dire)' : 'var(--color-text)', lineHeight: 1.2 }}>{dire}</div>
            <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>Dire</div>
          </div>
        </div>

        {/* Hero icons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          {/* Radiant heroes */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const heroId = radiantHeroIds[i];
              const heroName = heroId ? heroMap[heroId] : null;
              return (
                <div key={i} style={{ width: 44, height: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--color-border)', border: '1px solid rgba(77,186,135,0.25)', flexShrink: 0 }}>
                  {heroName && (
                    <Image
                      src={getHeroImageUrl(heroName)}
                      alt={heroName}
                      width={44}
                      height={28}
                      style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      unoptimized
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* Center label */}
          <div style={{ fontSize: 10, color: 'var(--color-dim)', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {mlData?.has_team_data && <span style={{ color: 'var(--color-radiant)' }}>✓ history</span>}
          </div>
          {/* Dire heroes */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-start' }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const heroId = direHeroIds[i];
              const heroName = heroId ? heroMap[heroId] : null;
              return (
                <div key={i} style={{ width: 44, height: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--color-border)', border: '1px solid rgba(192,57,43,0.25)', flexShrink: 0 }}>
                  {heroName && (
                    <Image
                      src={getHeroImageUrl(heroName)}
                      alt={heroName}
                      width={44}
                      height={28}
                      style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      unoptimized
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ML Prediction */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: 16 }}>
          ML Win Prediction · CatBoost
        </div>

        {mlLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '20px 0' }}>Computing prediction...</div>
        ) : mlData ? (
          <>
            {/* Probability bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ color: 'var(--color-radiant)', fontWeight: 800, fontSize: 26, minWidth: 60 }}>
                  {Math.round(radiantProb * 100)}%
                </span>
                <div style={{ flex: 1, height: 16, background: 'var(--color-border)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${radiantProb * 100}%`,
                    background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)',
                    transition: 'width 0.6s ease',
                    borderRadius: '8px 0 0 8px',
                  }} />
                  <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0,
                    width: `${direProb * 100}%`,
                    background: 'linear-gradient(90deg, #c0392b, var(--color-dire))',
                    transition: 'width 0.6s ease',
                    borderRadius: '0 8px 8px 0',
                  }} />
                </div>
                <span style={{ color: 'var(--color-dire)', fontWeight: 800, fontSize: 26, minWidth: 60, textAlign: 'right' }}>
                  {Math.round(direProb * 100)}%
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)' }}>
                <span style={{ color: 'var(--color-radiant)', fontWeight: 600 }}>RADIANT</span>
                <span>
                  {radiantProb > direProb
                    ? `Radiant favored +${Math.round((radiantProb - direProb) * 100)}%`
                    : radiantProb < direProb
                    ? `Dire favored +${Math.round((direProb - radiantProb) * 100)}%`
                    : 'Even match'}
                </span>
                <span style={{ color: 'var(--color-dire)', fontWeight: 600 }}>DIRE</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '12px 16px', background: 'rgba(192,57,43,0.08)', borderRadius: 8, fontSize: 13, color: '#e74c3c' }}>
            ML service unavailable — start predict_api.py
          </div>
        )}
      </div>

      {/* Bet Calculator */}
      {mounted && mlData && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: 16 }}>
            Bet Calculator
          </div>

          {/* Bet on toggle */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Bet on</div>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {(['team1', 'team2'] as const).map((side) => {
                const name = side === 'team1' ? radiant : dire;
                const prob = side === 'team1' ? radiantProb : direProb;
                const isActive = betOn === side;
                const color = side === 'team1' ? 'var(--color-radiant)' : 'var(--color-dire)';
                return (
                  <button key={side} onClick={() => setBetOn(side)} style={{
                    flex: 1, padding: '12px 16px', border: 'none', cursor: 'pointer',
                    background: isActive ? (side === 'team1' ? 'rgba(77,186,135,0.12)' : 'rgba(192,57,43,0.12)') : 'var(--color-bg)',
                    color: isActive ? color : 'var(--color-muted)',
                    fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.15s',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: isActive ? color : 'var(--color-dim)' }}>
                      {Math.round(prob * 100)}% ML prob
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Odds + Bankroll */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Your odds (bookmaker)
              </div>
              <input
                type="number" min="1.01" step="0.01"
                value={oddsInput}
                onChange={(e) => setOddsInput(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 18, fontWeight: 700, width: '100%', outline: 'none' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                Bankroll ($)
              </div>
              <input
                type="number" min="1" step="1"
                value={bankroll}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 100;
                  setBankroll(v);
                  try { localStorage.setItem('bets:bankroll', String(v)); } catch {}
                }}
                style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 18, fontWeight: 700, width: '100%', outline: 'none' }}
              />
            </div>
          </div>

          {/* Kelly result */}
          {kelly.ev <= 0 ? (
            <div style={{ padding: '16px 20px', background: 'rgba(192,57,43,0.08)', borderRadius: 10, border: '1px solid rgba(192,57,43,0.25)', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#e74c3c', marginBottom: 6 }}>NEGATIVE EV — SKIP</div>
              <div style={{ fontSize: 12, color: 'var(--color-dim)' }}>
                At {odds} odds, EV = {(kelly.ev * 100).toFixed(1)}%.{' '}
                Need at least <strong style={{ color: 'var(--color-gold)' }}>{(1 / betProb).toFixed(2)}</strong> odds for +EV.
              </div>
            </div>
          ) : (
            <div style={{ padding: '20px', background: 'rgba(77,186,135,0.07)', borderRadius: 10, border: '1px solid rgba(77,186,135,0.25)', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: 4 }}>EV</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#4dba87' }}>+{(kelly.ev * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Full Kelly</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-gold)' }}>${kelly.fullKelly}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-dim)' }}>{(kelly.frac * 100).toFixed(1)}% bankroll</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                    ½ Kelly <span style={{ color: 'var(--color-radiant)' }}>← recommended</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--color-radiant)' }}>${kelly.halfKelly}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-dim)' }}>{(kelly.frac / 2 * 100).toFixed(1)}% bankroll</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-dim)', borderTop: '1px solid rgba(77,186,135,0.15)', paddingTop: 12 }}>
                Betting <strong style={{ color: 'var(--color-radiant)' }}>${kelly.halfKelly}</strong> on <strong style={{ color: 'var(--color-text)' }}>{betOnName}</strong> at {odds} odds.
                {' '}Win: <strong style={{ color: '#4dba87' }}>+${((odds - 1) * kelly.halfKelly).toFixed(2)}</strong>{' '}
                · Loss: <strong style={{ color: '#e74c3c' }}>-${kelly.halfKelly}</strong>
              </div>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSaveBet}
            disabled={saved}
            style={{
              width: '100%', padding: '14px', borderRadius: 8, border: 'none',
              background: saved ? 'rgba(77,186,135,0.2)' : 'var(--color-radiant)',
              color: saved ? 'var(--color-radiant)' : '#000',
              fontWeight: 700, fontSize: 15, cursor: saved ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {saved ? '✓ Saved to Bet History' : `Save Bet — $${kelly.halfKelly} on ${betOnName}`}
          </button>
        </div>
      )}
    </div>
  );
}
