'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagues, getLeagueDateRanges } from '@/lib/opendota';
import { League } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

const NOW = Math.floor(Date.now() / 1000);
const RECENT_CUTOFF = NOW - 31 * 24 * 60 * 60; // 31 days ago

// ─── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDates(startTs: number, endTs: number): string {
  const start = new Date(startTs * 1000);
  const end = new Date(endTs * 1000);
  const sm = MONTHS[start.getMonth()];
  const em = MONTHS[end.getMonth()];
  if (start.getFullYear() !== end.getFullYear()) {
    return `${sm} ${start.getDate()} – ${em} ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sm === em) return `${sm} ${start.getDate()}–${end.getDate()}`;
  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

// ─── Categorisation ────────────────────────────────────────────────────────────

type DateRanges = Record<number, { first: number; last: number }>;
type Category = 'ongoing' | 'upcoming' | 'finished' | 'previous';

const FORCE_PREVIOUS = new Set([65006, 65001]);

function categorise(l: League, dates: DateRanges): Category {
  if (FORCE_PREVIOUS.has(l.leagueid)) return 'previous';

  const d = dates[l.leagueid];
  if (d) {
    // We have real match timestamps — use them
    if (d.first > NOW) return 'upcoming';           // no matches played yet
    if (d.last >= NOW - 7 * 24 * 60 * 60) return 'ongoing';  // last match within 7 days
    if (d.last >= RECENT_CUTOFF) return 'finished';
    return 'previous';
  }

  // No match data yet (new/upcoming tournament) — fall back to league metadata
  const start = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const end = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  if (start && start > NOW) return 'upcoming';
  if (end && end >= NOW) return 'ongoing';
  if (l.leagueid >= 19000) return 'upcoming'; // very new league, no matches yet
  return 'previous';
}

function getActualDates(l: League, dates: DateRanges): { start: number; end: number } | null {
  const d = dates[l.leagueid];
  if (d) return { start: d.first, end: d.last };
  const s = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const e = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  if (s) return { start: s, end: e || s };
  return null;
}

// ─── Cards ─────────────────────────────────────────────────────────────────────

function OngoingCard({ league, dates }: { league: League; dates: DateRanges }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  return (
    <Link href={`/tournaments/${league.leagueid}`} style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{ padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s', borderColor: 'rgba(77,186,135,0.3)' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-radiant)';
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-card-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(77,186,135,0.3)';
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-card)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--color-radiant)',
              display: 'inline-block', flexShrink: 0,
              boxShadow: '0 0 0 3px rgba(77,186,135,0.2), 0 0 8px var(--color-radiant)',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {league.name}
              </div>
              {dateStr && (
                <div style={{ fontSize: '11px', color: 'var(--color-radiant)', marginTop: 2, fontWeight: 600 }}>{dateStr}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4dba87', background: 'rgba(77,186,135,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
              Live
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-gold)', fontWeight: 600 }}>View →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TournamentCard({ league, dates, badge }: { league: League; dates: DateRanges; badge?: string }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  return (
    <Link href={`/tournaments/${league.leagueid}`} style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{ padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-bright)';
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-card-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)';
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-card)';
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-gold)', background: 'rgba(201,162,39,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
            {badge || 'Tier 1'}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-dim)', fontWeight: 600 }}>{dateStr}</span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4, marginBottom: '12px' }}>
          {league.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-dim)' }}>#{league.leagueid}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-gold)', fontWeight: 600 }}>View Stats →</span>
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({ dot, label, count, color }: { dot?: string; label: string; count: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', boxShadow: `0 0 6px ${dot}` }} />}
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: color || 'var(--color-text)', margin: 0 }}>{label}</h2>
      <span style={{ fontSize: '12px', color: 'var(--color-muted)', background: 'var(--color-border)', padding: '1px 8px', borderRadius: '999px' }}>
        {count}
      </span>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
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

  const dates: DateRanges = leagueDates || {};

  const sorted = useMemo(() => {
    if (!leagues) return [];
    return [...leagues].sort((a, b) => b.leagueid - a.leagueid);
  }, [leagues]);

  const { ongoing, upcoming, finished, previous } = useMemo(() => {
    const ongoing: League[] = [];
    const upcoming: League[] = [];
    const finished: League[] = [];
    const previous: League[] = [];
    sorted.forEach((l) => {
      const cat = categorise(l, dates);
      if (cat === 'ongoing') ongoing.push(l);
      else if (cat === 'upcoming') upcoming.push(l);
      else if (cat === 'finished') finished.push(l);
      else previous.push(l);
    });
    return { ongoing, upcoming, finished, previous };
  }, [sorted, dates]);

  const q = search.toLowerCase();
  const fs = (list: League[]) => !q ? list : list.filter((l) => l.name.toLowerCase().includes(q));

  const fOngoing = fs(ongoing);
  const fUpcoming = fs(upcoming);
  const fFinished = fs(finished);
  const fPrevious = fs(previous);

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '6px' }}>
          Tier 1 Tournaments
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '14px' }}>
          Professional Dota 2 tournament statistics — heroes, teams, drafts and meta trends.
        </p>
      </div>

      {leagues && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search tournament..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '9px 14px 9px 34px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-card)',
                color: 'var(--color-text)',
                fontSize: '13px',
                width: '260px',
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', fontSize: '14px' }}>⌕</span>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
            {fOngoing.length > 0 && <><span style={{ color: 'var(--color-radiant)', fontWeight: 600 }}>{fOngoing.length} live</span> · </>}
            {fUpcoming.length > 0 && <>{fUpcoming.length} upcoming · </>}
            {fFinished.length} finished · {fPrevious.length} previous
          </span>
        </div>
      )}

      {isLoading && <LoadingSpinner text="Fetching tournaments..." />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {leagues && (
        <>
          {/* Ongoing */}
          {fOngoing.length > 0 && (
            <section style={{ marginBottom: '36px' }}>
              <SectionHeader dot="var(--color-radiant)" label="Ongoing" count={fOngoing.length} color="var(--color-radiant)" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {fOngoing.map((l) => <OngoingCard key={l.leagueid} league={l} dates={dates} />)}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {fUpcoming.length > 0 && (
            <section style={{ marginBottom: '36px' }}>
              <SectionHeader dot="#7c9cbf" label="Upcoming" count={fUpcoming.length} color="#7c9cbf" />
              <Grid>
                {fUpcoming.map((l) => <TournamentCard key={l.leagueid} league={l} dates={dates} badge="Upcoming" />)}
              </Grid>
            </section>
          )}

          {/* Finished */}
          {fFinished.length > 0 && (
            <section style={{ marginBottom: '36px' }}>
              <SectionHeader dot="var(--color-gold)" label="Finished" count={fFinished.length} />
              <Grid>
                {fFinished.map((l) => <TournamentCard key={l.leagueid} league={l} dates={dates} />)}
              </Grid>
            </section>
          )}

          {fOngoing.length === 0 && fUpcoming.length === 0 && fFinished.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '14px', background: 'var(--color-card)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              No tournaments found.
            </div>
          )}

          {/* Previous — collapsible */}
          <section>
            <button
              onClick={() => setShowPrevious((p) => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: showPrevious ? '14px' : '0',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0', width: '100%',
              }}
            >
              <span style={{ fontSize: '15px', color: showPrevious ? 'var(--color-gold-bright)' : 'var(--color-muted)', transition: 'color 0.15s', fontWeight: 700 }}>
                {showPrevious ? '▼' : '▶'} Previous Events
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-muted)', background: 'var(--color-border)', padding: '1px 8px', borderRadius: '999px' }}>
                {fPrevious.length}
              </span>
            </button>
            {showPrevious && fPrevious.length > 0 && (
              <Grid>
                {fPrevious.map((l) => <TournamentCard key={l.leagueid} league={l} dates={dates} />)}
              </Grid>
            )}
          </section>
        </>
      )}
    </div>
  );
}
