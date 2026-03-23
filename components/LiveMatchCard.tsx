'use client';

import Link from 'next/link';
import { LiveMatch } from '@/lib/types';
import { formatGameTime } from '@/lib/formatters';

export default function LiveMatchCard({ match }: { match: LiveMatch }) {
  const radiant = match.team_name_radiant || 'Radiant';
  const dire = match.team_name_dire || 'Dire';
  const lead = match.radiant_lead;
  const leadAbs = Math.abs(lead);
  const leadStr = leadAbs >= 1000 ? `+${(leadAbs / 1000).toFixed(1)}k` : leadAbs > 0 ? `+${leadAbs}` : 'Even';

  return (
    <Link href={`/live/${match.match_id}`} className="no-underline block">
      <div className="
        bg-[linear-gradient(90deg,_rgba(77,186,135,0.05)_0%,_var(--color-card)_100%)]
        border border-[rgba(77,186,135,0.2)] rounded-[10px] py-3 px-[14px] mb-2
        cursor-pointer hover:border-[rgba(77,186,135,0.45)] hover:-translate-y-px
        transition-all duration-150
      ">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-radiant inline-block" />
            <span className="text-[10px] font-extrabold text-radiant uppercase tracking-widest">Live</span>
          </div>
          <span className="text-[10px] text-muted font-semibold">{formatGameTime(match.game_time)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex-1 text-[13px] font-bold truncate text-right ${lead >= 0 ? 'text-radiant' : 'text-content'}`}>
            {radiant}
          </span>
          <div className="shrink-0 text-center min-w-[52px]">
            <div className="text-sm font-extrabold text-content tracking-[0.05em]">
              {match.radiant_score} – {match.dire_score}
            </div>
            {leadAbs > 0 && (
              <div className={`text-[9px] font-bold ${lead > 0 ? 'text-radiant' : 'text-dire'}`}>{leadStr}</div>
            )}
          </div>
          <span className={`flex-1 text-[13px] font-bold truncate ${lead < 0 ? 'text-dire' : 'text-content'}`}>
            {dire}
          </span>
        </div>
        <div className="text-[10px] text-dim text-right mt-1">Tap for prediction →</div>
      </div>
    </Link>
  );
}
