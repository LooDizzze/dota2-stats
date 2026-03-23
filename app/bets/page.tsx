'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UpcomingMatch } from '@/lib/types';
import { formatMatchDate, formatMatchTime, formatCountdown } from '@/lib/formatters';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BackendTeam {
  team_id: number;
  name: string;
  tag: string;
  wins: number;
  losses: number;
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

function calcKelly(prob: number, odds: number, bankroll: number) {
  const b = odds - 1;
  const q = 1 - prob;
  const f = b > 0 ? Math.max(0, (b * prob - q) / b) : 0;
  return {
    kellyAmount: +(f * bankroll).toFixed(2),
    halfKellyAmount: +((f / 2) * bankroll).toFixed(2),
    ev: +(prob * odds - 1),
  };
}

function fuzzyMatch(name: string, teams: BackendTeam[]): BackendTeam | undefined {
  const n = name.toLowerCase().trim();
  return (
    teams.find((t) => t.name.toLowerCase() === n) ||
    teams.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase())) ||
    teams.find((t) => t.tag.toLowerCase() === n)
  );
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const LS_BETS = 'bets:v1';
const LS_BANKROLL = 'bets:bankroll';

function loadBets(): BetEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_BETS) || '[]'); } catch { return []; }
}
function saveBets(bets: BetEntry[]) {
  try { localStorage.setItem(LS_BETS, JSON.stringify(bets)); } catch {}
}

// ─── PnL helpers ───────────────────────────────────────────────────────────────

function getPnL(bet: BetEntry): number | null {
  if (bet.result === 'won') return +((bet.odds - 1) * bet.amount).toFixed(2);
  if (bet.result === 'lost') return -bet.amount;
  return null;
}

function resultBadge(result: BetResult) {
  if (result === 'won') return { label: 'WON', bg: 'rgba(77,186,135,0.15)', color: '#4dba87', border: 'rgba(77,186,135,0.35)' };
  if (result === 'lost') return { label: 'LOST', bg: 'rgba(192,57,43,0.15)', color: '#e74c3c', border: 'rgba(192,57,43,0.35)' };
  return { label: 'PENDING', bg: 'rgba(201,162,39,0.12)', color: '#c9a227', border: 'rgba(201,162,39,0.3)' };
}

// ─── Add Bet Panel ──────────────────────────────────────────────────────────────

function AddBetPanel({
  onAdd,
  onClose,
  bankroll,
  setBankroll,
  teams,
  upcoming,
}: {
  onAdd: (b: BetEntry) => void;
  onClose: () => void;
  bankroll: string;
  setBankroll: (v: string) => void;
  teams: BackendTeam[];
  upcoming: UpcomingMatch[];
}) {
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [tournament, setTournament] = useState('');
  const [matchTime, setMatchTime] = useState(0);
  const [oddsInput, setOddsInput] = useState('1.85');
  const [betOn, setBetOn] = useState<'team1' | 'team2'>('team1');
  const [team1Id, setTeam1Id] = useState<number | undefined>();
  const [team2Id, setTeam2Id] = useState<number | undefined>();
  const [mlProb, setMlProb] = useState<number | null>(null);
  const [mlLoading, setMlLoading] = useState(false);

  // Auto-match team names to backend IDs
  useEffect(() => {
    if (team1) {
      const m = fuzzyMatch(team1, teams);
      setTeam1Id(m?.team_id);
    }
  }, [team1, teams]);

  useEffect(() => {
    if (team2) {
      const m = fuzzyMatch(team2, teams);
      setTeam2Id(m?.team_id);
    }
  }, [team2, teams]);

  // Fetch ML prediction when team IDs change
  useEffect(() => {
    if (!team1Id && !team2Id) { setMlProb(null); return; }
    setMlLoading(true);
    fetch('/api/ml-predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        radiant_hero_ids: [],
        dire_hero_ids: [],
        radiant_team_id: team1Id ?? null,
        dire_team_id: team2Id ?? null,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setMlProb(betOn === 'team1' ? d.radiant_win_prob : d.dire_win_prob);
        setMlLoading(false);
      })
      .catch(() => { setMlLoading(false); });
  }, [team1Id, team2Id, betOn]);

  // Update mlProb when betOn flips (without refetch)
  useEffect(() => {
    if (mlProb === null) return;
    setMlProb((prev) => prev !== null ? 1 - prev : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betOn]);

  function fillFromMatch(m: UpcomingMatch) {
    setTeam1(m.team1);
    setTeam2(m.team2);
    setTournament(m.tournament);
    setMatchTime(m.timestamp);
  }

  const odds = parseFloat(oddsInput) || 1.85;
  const bank = parseFloat(bankroll) || 100;
  const prob = mlProb ?? 0.5;
  const { kellyAmount, halfKellyAmount, ev } = calcKelly(prob, odds, bank);

  function handleAdd() {
    if (!team1 || !team2) return;
    const bet: BetEntry = {
      id: uid(),
      createdAt: Date.now() / 1000,
      matchTime: matchTime || Date.now() / 1000,
      team1, team2, tournament,
      betOn,
      team1Id, team2Id,
      mlProb: prob,
      odds,
      amount: halfKellyAmount > 0 ? halfKellyAmount : 0,
      ev,
      result: 'pending',
    };
    onAdd(bet);
    onClose();
  }

  const inputStyle = {
    padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)', fontSize: 13, outline: 'none', width: '100%',
  };

  const labelStyle = { fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 4, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,24,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text)' }}>Add Bet</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Upcoming matches quick-fill */}
        {upcoming.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={labelStyle}>Upcoming matches — click to fill</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {upcoming.slice(0, 10).map((m, i) => (
                <button key={i} onClick={() => fillFromMatch(m)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)', cursor: 'pointer',
                  fontSize: 12, textAlign: 'left', gap: 8,
                }}>
                  <span style={{ fontWeight: 600 }}>{m.team1} <span style={{ color: 'var(--color-muted)' }}>vs</span> {m.team2}</span>
                  <span style={{ color: 'var(--color-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatMatchDate(m.timestamp)} · {formatMatchTime(m.timestamp)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Match info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Team 1 (Radiant)</label>
            <input style={inputStyle} value={team1} onChange={(e) => setTeam1(e.target.value)} placeholder="e.g. Team Liquid" />
            {team1 && (
              <div style={{ fontSize: 10, marginTop: 3, color: team1Id ? 'var(--color-radiant)' : 'var(--color-dim)' }}>
                {team1Id ? `✓ matched (id ${team1Id})` : '✗ no backend match — ML uses defaults'}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Team 2 (Dire)</label>
            <input style={inputStyle} value={team2} onChange={(e) => setTeam2(e.target.value)} placeholder="e.g. Team Falcons" />
            {team2 && (
              <div style={{ fontSize: 10, marginTop: 3, color: team2Id ? 'var(--color-radiant)' : 'var(--color-dim)' }}>
                {team2Id ? `✓ matched (id ${team2Id})` : '✗ no backend match — ML uses defaults'}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Tournament</label>
            <input style={inputStyle} value={tournament} onChange={(e) => setTournament(e.target.value)} placeholder="ESL One Birmingham 2026" />
          </div>
          <div>
            <label style={labelStyle}>Bankroll ($)</label>
            <input type="number" min="1" style={inputStyle} value={bankroll} onChange={(e) => setBankroll(e.target.value)} />
          </div>
        </div>

        {/* ML prediction */}
        <div style={{ padding: '12px 14px', background: 'rgba(26,39,64,0.6)', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 8 }}>ML Prediction</div>
          {mlLoading ? (
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>Computing...</div>
          ) : (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Team 1 win prob</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-radiant)' }}>
                  {mlProb !== null ? `${Math.round(mlProb * 100)}%` : '—'}
                </div>
              </div>
              <div style={{ color: 'var(--color-dim)', fontSize: 13 }}>vs</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>Team 2 win prob</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-dire)' }}>
                  {mlProb !== null ? `${Math.round((1 - mlProb) * 100)}%` : '—'}
                </div>
              </div>
              {!team1Id && !team2Id && (
                <div style={{ fontSize: 11, color: 'var(--color-dim)', marginLeft: 'auto' }}>
                  Enter teams above to get prediction
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bet configuration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Bet on</label>
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {(['team1', 'team2'] as const).map((side) => (
                <button key={side} onClick={() => setBetOn(side)} style={{
                  flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: betOn === side ? 'var(--color-border-bright)' : 'var(--color-bg)',
                  color: betOn === side ? 'var(--color-text)' : 'var(--color-muted)',
                  transition: 'all 0.15s',
                }}>
                  {side === 'team1' ? (team1 || 'Team 1') : (team2 || 'Team 2')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Bookmaker odds</label>
            <input type="number" min="1.01" step="0.01" style={inputStyle} value={oddsInput} onChange={(e) => setOddsInput(e.target.value)} />
          </div>
        </div>

        {/* Kelly summary */}
        {(team1 || team2) && (
          <div style={{ padding: '14px 16px', borderRadius: 8, marginBottom: 20, border: `1px solid ${ev > 0 ? 'rgba(77,186,135,0.3)' : 'rgba(192,57,43,0.25)'}`, background: ev > 0 ? 'rgba(77,186,135,0.07)' : 'rgba(192,57,43,0.07)' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 2 }}>EV</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: ev > 0 ? '#4dba87' : '#e74c3c' }}>{ev > 0 ? '+' : ''}{(ev * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 2 }}>Full Kelly</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-gold)' }}>${kellyAmount}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 2 }}>½ Kelly <span style={{ color: 'var(--color-radiant)' }}>rec.</span></div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-radiant)' }}>${halfKellyAmount}</div>
              </div>
              {ev <= 0 && (
                <div style={{ fontSize: 11, color: '#e74c3c', marginLeft: 'auto' }}>
                  Negative EV — min odds for +EV: <strong>{(1 / prob).toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!team1 || !team2}
            style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: team1 && team2 ? 'var(--color-radiant)' : 'var(--color-border)', color: team1 && team2 ? '#000' : 'var(--color-dim)', cursor: team1 && team2 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13 }}
          >
            Save Bet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BetsPage() {
  const [bets, setBets] = useState<BetEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [bankroll, setBankroll] = useState('100');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBets(loadBets());
    const sync = () => {
      const v = localStorage.getItem(LS_BANKROLL);
      if (v) setBankroll(v);
    };
    sync();
    window.addEventListener('bankroll-updated', sync);
    return () => window.removeEventListener('bankroll-updated', sync);
  }, []);

  useEffect(() => {
    if (mounted) { saveBets(bets); }
  }, [bets, mounted]);

  const { data: teams = [] } = useQuery<BackendTeam[]>({
    queryKey: ['backend-teams'],
    queryFn: async () => {
      const r = await fetch('/api/backend-teams');
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: matchData } = useQuery({
    queryKey: ['lp-upcoming-for-bets'],
    queryFn: async () => {
      const r = await fetch('/api/liquipedia/matches?names=');
      return r.json() as Promise<{ matches: UpcomingMatch[] }>;
    },
    staleTime: 1000 * 60 * 5,
  });

  const upcoming: UpcomingMatch[] = matchData?.matches || [];

  function addBet(bet: BetEntry) {
    setBets((prev) => [bet, ...prev]);
  }

  function setResult(id: string, result: BetResult) {
    const old = bets.find((b) => b.id === id);
    if (!old || old.result === result) return;

    // update bankroll outside setBets to avoid double-call in StrictMode
    try {
      const current = parseFloat(localStorage.getItem(LS_BANKROLL) || '0') || 0;
      let next = current;
      if (old.result === 'won') next -= +(old.amount * old.odds).toFixed(2);
      if (result === 'won') next += +(old.amount * old.odds).toFixed(2);
      next = +next.toFixed(2);
      localStorage.setItem(LS_BANKROLL, String(next));
      window.dispatchEvent(new Event('bankroll-updated'));
    } catch {}

    setBets((prev) => prev.map((b) => b.id === id ? { ...b, result } : b));
  }

  function deleteBet(id: string) {
    setBets((prev) => prev.filter((b) => b.id !== id));
  }

  const stats = useMemo(() => {
    const settled = bets.filter((b) => b.result !== 'pending');
    const won = bets.filter((b) => b.result === 'won');
    const lost = bets.filter((b) => b.result === 'lost');
    const pnl = bets.reduce((acc, b) => {
      const p = getPnL(b);
      return acc + (p ?? 0);
    }, 0);
    const totalStaked = settled.reduce((acc, b) => acc + b.amount, 0);
    const roi = totalStaked > 0 ? (pnl / totalStaked) * 100 : 0;
    return { total: bets.length, won: won.length, lost: lost.length, pending: bets.filter((b) => b.result === 'pending').length, pnl, roi };
  }, [bets]);

  if (!mounted) return null;

  return (
    <div>
      {showAdd && (
        <AddBetPanel
          onAdd={addBet}
          onClose={() => setShowAdd(false)}
          bankroll={bankroll}
          setBankroll={(v) => setBankroll(v)}
          teams={teams}
          upcoming={upcoming}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-gold)', marginBottom: 4 }}>
            ML Betting
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>Bet History</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--color-radiant)', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          + Add Bet
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Bets', value: stats.total, color: 'var(--color-text)' },
          { label: 'Won', value: stats.won, color: '#4dba87' },
          { label: 'Lost', value: stats.lost, color: '#e74c3c' },
          { label: 'Pending', value: stats.pending, color: 'var(--color-gold)' },
          {
            label: 'P&L',
            value: `${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`,
            color: stats.pnl >= 0 ? '#4dba87' : '#e74c3c',
          },
          {
            label: 'ROI',
            value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`,
            color: stats.roi >= 0 ? '#4dba87' : '#e74c3c',
          },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bets table */}
      {bets.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 14 }}>
          No bets yet. Click <strong>+ Add Bet</strong> to get started.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="dota-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Match</th>
                <th>Tournament</th>
                <th style={{ textAlign: 'center' }}>Bet on</th>
                <th style={{ textAlign: 'center' }}>ML Prob</th>
                <th style={{ textAlign: 'center' }}>Odds</th>
                <th style={{ textAlign: 'center' }}>EV</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Result</th>
                <th style={{ textAlign: 'right' }}>P&L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bets.map((bet) => {
                const badge = resultBadge(bet.result);
                const pnl = getPnL(bet);
                const betOnName = bet.betOn === 'team1' ? bet.team1 : bet.team2;
                return (
                  <tr key={bet.id} className="group">
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{bet.team1} <span style={{ color: 'var(--color-dim)' }}>vs</span> {bet.team2}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-dim)', marginTop: 2 }}>
                        {formatMatchDate(bet.matchTime)} · {formatMatchTime(bet.matchTime)}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)', maxWidth: 160 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bet.tournament}</div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                      {betOnName}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: bet.mlProb >= 0.54 ? '#4dba87' : 'var(--color-muted)' }}>
                        {Math.round(bet.mlProb * 100)}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--color-gold)', fontWeight: 600 }}>{bet.odds.toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: bet.ev > 0 ? '#4dba87' : '#e74c3c', fontSize: 12 }}>
                        {bet.ev > 0 ? '+' : ''}{(bet.ev * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>
                      ${bet.amount.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {(['won', 'lost', 'pending'] as BetResult[]).map((r) => (
                          <button
                            key={r}
                            onClick={() => setResult(bet.id, r)}
                            title={r.charAt(0).toUpperCase() + r.slice(1)}
                            style={{
                              padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                              cursor: 'pointer', border: '1px solid',
                              background: bet.result === r ? resultBadge(r).bg : 'transparent',
                              color: bet.result === r ? resultBadge(r).color : 'var(--color-dim)',
                              borderColor: bet.result === r ? resultBadge(r).border : 'var(--color-border)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {resultBadge(r).label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>
                      {pnl !== null ? (
                        <span style={{ color: pnl >= 0 ? '#4dba87' : '#e74c3c' }}>
                          {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-dim)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', width: 28 }}>
                      <button
                        onClick={() => deleteBet(bet.id)}
                        className="opacity-0 group-hover:opacity-100"
                        style={{ background: 'none', border: 'none', color: 'var(--color-dim)', cursor: 'pointer', fontSize: 13, padding: '0 2px', transition: 'opacity 0.15s' }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
