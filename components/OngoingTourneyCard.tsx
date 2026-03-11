'use client';

import Link from 'next/link';
import { League, DateRanges } from '@/lib/types';
import { formatDates } from '@/lib/formatters';

function getActualDates(l: League, dates: DateRanges) {
  const d = dates[l.leagueid];
  if (d) return { start: d.first, end: d.last };
  const s = l.start_timestamp && l.start_timestamp < 1e10 ? l.start_timestamp : null;
  const e = l.end_timestamp && l.end_timestamp < 1e10 ? l.end_timestamp : null;
  return s ? { start: s, end: e || s } : null;
}

export default function OngoingTourneyCard({ league, dates }: { league: League; dates: DateRanges }) {
  const d = getActualDates(league, dates);
  const dateStr = d ? formatDates(d.start, d.end) : '';
  return (
    <Link href={`/tournaments/${league.leagueid}`} className="no-underline">
      <div className="
        bg-[linear-gradient(135deg,_rgba(77,186,135,0.08)_0%,_var(--color-card)_60%)]
        border border-[rgba(77,186,135,0.2)] border-l-[3px] border-l-radiant
        rounded-[10px] py-4 px-[18px] cursor-pointer
        transition-all duration-150 mb-2.5
        hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(77,186,135,0.1)]
      ">
        <div className="flex items-center gap-2 mb-2">
          <span className="live-dot w-[7px] h-[7px] rounded-full bg-radiant inline-block shrink-0" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-radiant">Live</span>
        </div>
        <div className="text-[15px] font-bold text-content leading-[1.3] mb-1.5">
          {league.name}
        </div>
        {dateStr && (
          <div className="text-[11px] text-muted font-medium">{dateStr}</div>
        )}
        <div className="mt-3 pt-2.5 border-t border-border flex justify-end">
          <span className="text-xs text-gold font-semibold">View Stats →</span>
        </div>
      </div>
    </Link>
  );
}
