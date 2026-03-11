'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getLeagues, getLeagueDateRanges } from '@/lib/opendota';
import { League, UpcomingMatch, LiveMatch, DateRanges } from '@/lib/types';
import { formatDates } from '@/lib/formatters';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';
import OngoingTourneyCard from '@/components/OngoingTourneyCard';
import LiveMatchCard from '@/components/LiveMatchCard';
import UpcomingMatchCard from '@/components/UpcomingMatchCard';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'ongoing' | 'upcoming' | 'finished' | 'previous';

const FORCE_PREVIOUS = new Set([65006, 65001]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categorise(l: League, dates: DateRanges, now: number): Category {
  const recentCutoff = now - 31 * 24 * 60 * 60;
  if (FORCE_PREVIOUS.has(l.leagueid)) return 'previous';
  const d = dates[l.leagueid];
  if (d) {
    if (d.first > now) return 'upcoming';
    if (d.last >= now - 7 * 24 * 60 * 60) return 'ongoing';
    if (d.last >= recentCutoff) return 'finished';
    return 'previous';
  }
  const start = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const end = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  if (start && start > now) return 'upcoming';
  if (end && end >= now) return 'ongoing';
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

// ─── Right panel helpers ───────────────────────────────────────────────────────

const VARIANT_CLASSES: Record<Category, string> = {
  ongoing:  'text-radiant',
  upcoming: 'text-upcoming',
  finished: 'text-gold',
  previous: 'text-dim',
};

function TournamentRow({ league, dates, variant }: { league: League; dates: DateRanges; variant: Category }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  const accentClass = VARIANT_CLASSES[variant];

  return (
    <Link href={`/tournaments/${league.leagueid}`} className="no-underline">
      <div className="py-2.5 px-[14px] border-b border-border cursor-pointer transition-colors duration-100 hover:bg-card-hover">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            {variant === 'ongoing' && (
              <div className="flex items-center gap-[5px] mb-0.5">
                <span className="live-dot w-[5px] h-[5px] rounded-full bg-radiant inline-block shrink-0" />
              </div>
            )}
            <div className="text-[13px] font-semibold text-content leading-[1.3] truncate">
              {league.name}
            </div>
            {dateStr && (
              <div className={`text-[10px] mt-0.5 font-medium ${accentClass}`}>{dateStr}</div>
            )}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-[0.08em] shrink-0 mt-0.5 ${accentClass}`}>
            {variant === 'ongoing' ? 'Live' : variant === 'upcoming' ? 'Soon' : variant === 'finished' ? 'Done' : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SidebarSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="py-2 px-[14px] bg-border">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [showPrevious, setShowPrevious] = useState(false);

  // Computed fresh at each render — no stale module-level constant
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);

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
      const cat = categorise(l, dates, now);
      if (cat === 'ongoing') ongoing.push(l);
      else if (cat === 'upcoming') upcoming.push(l);
      else if (cat === 'finished') finished.push(l);
      else previous.push(l);
    });
    return { ongoing, upcoming, finished, previous };
  }, [sorted, dates, now]);

  const ongoingLeagueIds = useMemo(() => new Set(ongoing.map((l) => l.leagueid)), [ongoing]);

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
      <div className="mb-6 pb-5 border-b border-border flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-gold mb-1">
            Professional Dota 2
          </div>
          <h1 className="text-[26px] font-extrabold text-content m-0 leading-[1.2]">
            Tournament Hub
          </h1>
        </div>
        {leagues && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="py-[9px] pr-[14px] pl-[34px] rounded-lg border border-border bg-card text-content text-[13px] w-[200px] outline-none focus:border-border-bright transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
          </div>
        )}
      </div>

      {isLoading && <LoadingSpinner text="Fetching tournaments..." />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {leagues && (
        <div className="grid grid-cols-[280px_1fr_300px] gap-5 items-start">

          {/* ── LEFT: Ongoing tournaments ── */}
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-radiant mb-3">
              Ongoing · {fOngoing.length}
            </div>
            {fOngoing.length > 0 ? (
              fOngoing.map((l) => <OngoingTourneyCard key={l.leagueid} league={l} dates={dates} />)
            ) : (
              <div className="text-[13px] text-muted py-4">No ongoing tournaments.</div>
            )}
          </div>

          {/* ── MIDDLE: Live + Upcoming matches ── */}
          <div>
            {/* Live matches */}
            <div className="mb-6">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-radiant mb-3 flex items-center gap-2">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-radiant inline-block" />
                Live Now
                {liveProMatches.length > 0 && (
                  <span className="text-[11px] text-muted bg-border px-2 py-px rounded-full font-semibold">
                    {liveProMatches.length}
                  </span>
                )}
              </div>
              {liveProMatches.length > 0
                ? liveProMatches.map((m) => <LiveMatchCard key={m.match_id} match={m} />)
                : (
                  <div className="py-3.5 px-4 bg-card border border-border rounded-[10px] text-[13px] text-muted text-center">
                    No live matches right now
                  </div>
                )
              }
            </div>

            {/* Upcoming matches */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-upcoming mb-3 flex items-center gap-2">
                Upcoming Matches
                {upcomingMatches.length > 0 && (
                  <span className="text-[11px] text-muted bg-border px-2 py-px rounded-full font-semibold">
                    {upcomingMatches.length}
                  </span>
                )}
              </div>
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map((m, i) => <UpcomingMatchCard key={i} match={m} />)
              ) : (
                <div className="p-4 bg-card rounded-[10px] border border-border">
                  <div className={`text-[13px] text-muted text-center ${matchData?.debug ? 'mb-2' : ''}`}>
                    {matchData?.error ? `Error: ${matchData.error}` : 'No scheduled matches found.'}
                  </div>
                  {matchData?.debug && matchData.debug.length > 0 && (
                    <div className="text-[10px] text-dim leading-[1.6] border-t border-border pt-2 mt-1">
                      {matchData.debug.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Tournament sidebar ── */}
          <div>
            <div className="bg-card border border-border rounded-[10px] overflow-hidden">
              <div className="py-3 px-[14px] border-b border-border text-[13px] font-bold text-content">
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
                    className="w-full py-2 px-[14px] bg-border border-none cursor-pointer text-left flex items-center gap-2"
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-dim">
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
