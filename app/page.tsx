'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagues, getLeagueDateRanges } from '@/lib/opendota';
import { League } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

const NOW = Math.floor(Date.now() / 1000);
const RECENT_CUTOFF = NOW - 31 * 24 * 60 * 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface UpcomingMatch {
  timestamp: number;
  team1: string;
  team2: string;
  bestof: number;
  tournament: string;
}

interface LiveMatch {
  match_id: string;
  league_id: number;
  team_name_radiant: string;
  team_name_dire: string;
  game_time: number;
  radiant_score: number;
  dire_score: number;
  radiant_lead: number;
  spectators: number;
}

type DateRanges = Record<number, { first: number; last: number }>;
type Category = 'ongoing' | 'upcoming' | 'finished' | 'previous';

const FORCE_PREVIOUS = new Set([65006, 65001]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDates(startTs: number, endTs: number): string {
  const s = new Date(startTs * 1000), e = new Date(endTs * 1000);
  const sm = MONTHS[s.getMonth()], em = MONTHS[e.getMonth()];
  if (s.getFullYear() !== e.getFullYear()) return `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${e.getFullYear()}`;
  if (sm === em) return `${sm} ${s.getDate()}–${e.getDate()}`;
  return `${sm} ${s.getDate()} – ${em} ${e.getDate()}`;
}

function formatGameTime(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function formatCountdown(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMatchTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
}

function formatMatchDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function categorise(l: League, dates: DateRanges): Category {
  if (FORCE_PREVIOUS.has(l.leagueid)) return 'previous';
  const d = dates[l.leagueid];
  if (d) {
    if (d.first > NOW) return 'upcoming';
    if (d.last >= NOW - 7 * 24 * 60 * 60) return 'ongoing';
    if (d.last >= RECENT_CUTOFF) return 'finished';
    return 'previous';
  }
  const start = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const end = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  if (start && start > NOW) return 'upcoming';
  if (end && end >= NOW) return 'ongoing';
  if (l.leagueid >= 19000) return 'upcoming';
  return 'previous';
}

function getActualDates(l: League, dates: DateRanges) {
  const d = dates[l.leagueid];
  if (d) return { start: d.first, end: d.last };
  const s = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const e = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  return s ? { start: s, end: e || s } : null;
}

// ─── Left panel: ongoing tournament cards ─────────────────────────────────────

function OngoingTourneyCard({ league, dates }: { league: League; dates: DateRanges }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  return (
    <Link href={`/tournaments/${league.leagueid}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(77,186,135,0.08) 0%, var(--color-card) 60%)',
          border: '1px solid rgba(77,186,135,0.2)',
          borderLeft: '3px solid var(--color-radiant)',
          borderRadius: '10px',
          padding: '16px 18px',
          cursor: 'pointer',
          transition: 'all 0.15s',
          marginBottom: '10px',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.transform = 'translateY(-2px)';
          el.style.boxShadow = '0 6px 20px rgba(77,186,135,0.1)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.transform = '';
          el.style.boxShadow = '';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-radiant)', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-radiant)' }}>Live</span>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, marginBottom: 6 }}>
          {league.name}
        </div>
        {dateStr && (
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 500 }}>{dateStr}</div>
        )}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-gold)', fontWeight: 600 }}>View Stats →</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Middle panel: upcoming match card ────────────────────────────────────────

function UpcomingMatchCard({ match }: { match: UpcomingMatch }) {
  const countdown = formatCountdown(match.timestamp);
  const timeStr = formatMatchTime(match.timestamp);
  const dateStr = formatMatchDate(match.timestamp);
  const isSoon = match.timestamp - Math.floor(Date.now() / 1000) < 3600;

  return (
    <div style={{
      background: 'var(--color-card)',
      border: `1px solid ${isSoon ? 'rgba(77,186,135,0.25)' : 'var(--color-border)'}`,
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '8px',
    }}>
      {/* Tournament + countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '10px', color: 'var(--color-muted)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {match.tournament}
        </span>
        <span style={{
          fontSize: '11px', fontWeight: 700,
          color: isSoon ? 'var(--color-radiant)' : 'var(--color-gold)',
          background: isSoon ? 'rgba(77,186,135,0.1)' : 'rgba(201,162,39,0.1)',
          padding: '2px 8px', borderRadius: '4px',
          flexShrink: 0,
        }}>
          {countdown}
        </span>
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {match.team1}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
            Bo{match.bestof}
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-dim)', marginTop: 1 }}>VS</div>
        </div>
        <div style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {match.team2}
        </div>
      </div>

      {/* Time */}
      <div style={{ marginTop: 8, fontSize: '10px', color: 'var(--color-dim)', textAlign: 'center' }}>
        {dateStr} · {timeStr}
      </div>
    </div>
  );
}

// ─── Middle panel: live match card ────────────────────────────────────────────

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const radiant = match.team_name_radiant || 'Radiant';
  const dire = match.team_name_dire || 'Dire';
  const lead = match.radiant_lead;
  const leadAbs = Math.abs(lead);
  const leadStr = leadAbs >= 1000 ? `+${(leadAbs / 1000).toFixed(1)}k` : leadAbs > 0 ? `+${leadAbs}` : 'Even';

  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(77,186,135,0.05) 0%, var(--color-card) 100%)',
      border: '1px solid rgba(77,186,135,0.2)',
      borderRadius: '10px',
      padding: '12px 14px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-radiant)', display: 'inline-block' }} />
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-radiant)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--color-muted)', fontWeight: 600 }}>{formatGameTime(match.game_time)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: lead >= 0 ? 'var(--color-radiant)' : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{radiant}</span>
        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 52 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '0.05em' }}>
            {match.radiant_score} – {match.dire_score}
          </div>
          {leadAbs > 0 && (
            <div style={{ fontSize: '9px', color: lead > 0 ? 'var(--color-radiant)' : 'var(--color-dire)', fontWeight: 700 }}>{leadStr}</div>
          )}
        </div>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: lead < 0 ? 'var(--color-dire)' : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dire}</span>
      </div>
    </div>
  );
}

// ─── Right panel: tournament list ─────────────────────────────────────────────

function TournamentRow({ league, dates, variant }: { league: League; dates: DateRanges; variant: 'ongoing' | 'upcoming' | 'finished' | 'previous' }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  const colors: Record<string, string> = {
    ongoing: 'var(--color-radiant)',
    upcoming: '#7c9cbf',
    finished: 'var(--color-gold)',
    previous: 'var(--color-dim)',
  };
  const accent = colors[variant];

  return (
    <Link href={`/tournaments/${league.leagueid}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.1s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-card-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {variant === 'ongoing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span className="live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-radiant)', display: 'inline-block', flexShrink: 0 }} />
              </div>
            )}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {league.name}
            </div>
            {dateStr && <div style={{ fontSize: '10px', color: accent, marginTop: 2, fontWeight: 500 }}>{dateStr}</div>}
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent, flexShrink: 0, marginTop: 2 }}>
            {variant === 'ongoing' ? 'Live' : variant === 'upcoming' ? 'Soon' : variant === 'finished' ? 'Done' : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SidebarSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ padding: '8px 14px', background: 'var(--color-border)', borderRadius: '0' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [showPrevious, setShowPrevious] = useState(false);

  const { data: leagues, isLoading, error } = useQuery({
    queryKey: ['leagues'],
    queryFn: getLeagues,
  });

  const { data: leagueDates } = useQuery({
    queryKey: ['league-date-ranges'],
    queryFn: getLeagueDateRanges,
    staleTime: 1000 * 60 * 30,
  });

  const { data: liveData } = useQuery({
    queryKey: ['live-matches'],
    queryFn: async () => {
      const res = await fetch('https://api.opendota.com/api/live');
      return res.json() as Promise<LiveMatch[]>;
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const dates: DateRanges = leagueDates || {};

  const sorted = useMemo(() => {
    if (!leagues) return [];
    return [...leagues].sort((a, b) => b.leagueid - a.leagueid);
  }, [leagues]);

  const { ongoing, upcoming, finished, previous } = useMemo(() => {
    const ongoing: League[] = [], upcoming: League[] = [], finished: League[] = [], previous: League[] = [];
    sorted.forEach((l) => {
      const cat = categorise(l, dates);
      if (cat === 'ongoing') ongoing.push(l);
      else if (cat === 'upcoming') upcoming.push(l);
      else if (cat === 'finished') finished.push(l);
      else previous.push(l);
    });
    return { ongoing, upcoming, finished, previous };
  }, [sorted, dates]);

  const ongoingLeagueIds = useMemo(() => new Set(ongoing.map((l) => l.leagueid)), [ongoing]);

  // Include both ongoing + upcoming tournaments in the match schedule query
  const matchQueryNames = useMemo(
    () => [...ongoing, ...upcoming].map((l) => l.name).join(','),
    [ongoing, upcoming]
  );

  const { data: matchData } = useQuery({
    queryKey: ['lp-upcoming-matches', matchQueryNames],
    queryFn: async () => {
      const res = await fetch(`/api/liquipedia/matches?names=${encodeURIComponent(matchQueryNames)}`);
      return res.json() as Promise<{ matches: UpcomingMatch[]; error?: string; debug?: string[] }>;
    },
    enabled: matchQueryNames.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const liveProMatches = useMemo(() => {
    if (!liveData || ongoingLeagueIds.size === 0) return [];
    return liveData
      .filter((m) => ongoingLeagueIds.has(m.league_id) && (m.team_name_radiant || m.team_name_dire))
      .sort((a, b) => b.spectators - a.spectators)
      .slice(0, 6);
  }, [liveData, ongoingLeagueIds]);

  const q = search.toLowerCase();
  const fs = (list: League[]) => !q ? list : list.filter((l) => l.name.toLowerCase().includes(q));
  const fOngoing = fs(ongoing);
  const fUpcoming = fs(upcoming);
  const fFinished = fs(finished);
  const fPrevious = fs(previous);

  const upcomingMatches = matchData?.matches || [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--color-gold)', marginBottom: 4 }}>
            Professional Dota 2
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.2 }}>
            Tournament Hub
          </h1>
        </div>
        {leagues && (
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '9px 14px 9px 34px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-text)', fontSize: '13px', width: '200px', outline: 'none' }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-border-bright)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', fontSize: '14px', pointerEvents: 'none' }}>⌕</span>
          </div>
        )}
      </div>

      {isLoading && <LoadingSpinner text="Fetching tournaments..." />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {leagues && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 300px', gap: '20px', alignItems: 'start' }}>

          {/* ── LEFT: Ongoing tournaments ── */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-radiant)', marginBottom: 12 }}>
              Ongoing · {fOngoing.length}
            </div>
            {fOngoing.length > 0 ? (
              fOngoing.map((l) => <OngoingTourneyCard key={l.leagueid} league={l} dates={dates} />)
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--color-muted)', padding: '16px 0' }}>No ongoing tournaments.</div>
            )}
          </div>

          {/* ── MIDDLE: Live + Upcoming matches ── */}
          <div>
            {/* Live matches */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-radiant)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-radiant)', display: 'inline-block' }} />
                Live Now
                {liveProMatches.length > 0 && <span style={{ fontSize: '11px', color: 'var(--color-muted)', background: 'var(--color-border)', padding: '1px 8px', borderRadius: '999px', fontWeight: 600 }}>{liveProMatches.length}</span>}
              </div>
              {liveProMatches.length > 0
                ? liveProMatches.map((m) => <LiveMatchCard key={m.match_id} match={m} />)
                : (
                  <div style={{ padding: '14px 16px', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center' }}>
                    No live matches right now
                  </div>
                )
              }
            </div>

            {/* Upcoming matches */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7c9cbf', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                Upcoming Matches
                {upcomingMatches.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)', background: 'var(--color-border)', padding: '1px 8px', borderRadius: '999px', fontWeight: 600 }}>
                    {upcomingMatches.length}
                  </span>
                )}
              </div>
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map((m, i) => <UpcomingMatchCard key={i} match={m} />)
              ) : (
                <div style={{ padding: '16px', background: 'var(--color-card)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '13px', color: 'var(--color-muted)', textAlign: 'center', marginBottom: matchData?.debug ? 8 : 0 }}>
                    {matchData?.error ? `Error: ${matchData.error}` : 'No scheduled matches found.'}
                  </div>
                  {matchData?.debug && matchData.debug.length > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--color-dim)', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: 8, marginTop: 4 }}>
                      {matchData.debug.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Tournament sidebar ── */}
          <div>
            <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                Tournaments
              </div>

              {fOngoing.length > 0 && (
                <SidebarSection label="Ongoing" color="var(--color-radiant)">
                  {fOngoing.map((l) => <TournamentRow key={l.leagueid} league={l} dates={dates} variant="ongoing" />)}
                </SidebarSection>
              )}

              {fUpcoming.length > 0 && (
                <SidebarSection label="Upcoming" color="#7c9cbf">
                  {fUpcoming.map((l) => <TournamentRow key={l.leagueid} league={l} dates={dates} variant="upcoming" />)}
                </SidebarSection>
              )}

              {fFinished.length > 0 && (
                <SidebarSection label="Finished" color="var(--color-gold)">
                  {fFinished.map((l) => <TournamentRow key={l.leagueid} league={l} dates={dates} variant="finished" />)}
                </SidebarSection>
              )}

              {fPrevious.length > 0 && (
                <>
                  <button
                    onClick={() => setShowPrevious((p) => !p)}
                    style={{ width: '100%', padding: '8px 14px', background: 'var(--color-border)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-dim)' }}>
                      {showPrevious ? '▼' : '▶'} Previous ({fPrevious.length})
                    </span>
                  </button>
                  {showPrevious && fPrevious.map((l) => <TournamentRow key={l.leagueid} league={l} dates={dates} variant="previous" />)}
                </>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
