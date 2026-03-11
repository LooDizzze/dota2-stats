'use client';

import { UpcomingMatch } from '@/lib/types';
import { formatCountdown, formatMatchTime, formatMatchDate } from '@/lib/formatters';

export default function UpcomingMatchCard({ match }: { match: UpcomingMatch }) {
  const countdown = formatCountdown(match.timestamp);
  const timeStr = formatMatchTime(match.timestamp);
  const dateStr = formatMatchDate(match.timestamp);
  const isSoon = match.timestamp - Math.floor(Date.now() / 1000) < 3600;

  return (
    <div className={`bg-card rounded-[10px] py-3.5 px-4 mb-2 border ${isSoon ? 'border-[rgba(77,186,135,0.25)]' : 'border-border'}`}>

      {/* Tournament + countdown */}
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[10px] text-muted font-semibold truncate max-w-[60%]">
          {match.tournament}
        </span>
        <span className={`text-[11px] font-bold py-0.5 px-2 rounded shrink-0 ${
          isSoon
            ? 'text-radiant bg-[rgba(77,186,135,0.1)]'
            : 'text-gold bg-[rgba(201,162,39,0.1)]'
        }`}>
          {countdown}
        </span>
      </div>

      {/* Teams */}
      <div className="flex items-center gap-2">
        <div className="flex-1 text-sm font-bold text-content text-right truncate">
          {match.team1}
        </div>
        <div className="shrink-0 text-center min-w-[60px]">
          <div className="text-[10px] font-extrabold text-muted tracking-[0.05em]">
            Bo{match.bestof}
          </div>
          <div className="text-[11px] font-semibold text-dim mt-px">VS</div>
        </div>
        <div className="flex-1 text-sm font-bold text-content truncate">
          {match.team2}
        </div>
      </div>

      {/* Time */}
      <div className="mt-2 text-[10px] text-dim text-center">
        {dateStr} · {timeStr}
      </div>
    </div>
  );
}
