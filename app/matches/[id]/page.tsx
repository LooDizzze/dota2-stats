'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import {
  getMatch, getHeroImageUrl, getItemImageUrl, buildItemIdMap,
  getItemConstants, formatDuration,
} from '@/lib/opendota';
import { formatDate, kda } from '@/lib/utils';
import { PlayerMatch, PickBan, MatchObjective } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

function useHeroConstants() {
  return useQuery({
    queryKey: ['hero-constants'],
    queryFn: async () => {
      const res = await fetch('https://api.opendota.com/api/constants/heroes');
      return res.json() as Promise<Record<string, { id: number; name: string; localized_name: string }>>;
    },
    staleTime: Infinity,
  });
}

function ItemIcon({ itemId, idMap }: { itemId: number | undefined; idMap: Record<number, { name: string; dname: string }> }) {
  if (!itemId || itemId === 0) {
    return <div style={{ width: 36, height: 26, background: 'rgba(26,39,64,0.6)', borderRadius: 3 }} />;
  }
  const item = idMap[itemId];
  if (!item) return <div style={{ width: 36, height: 26, background: 'var(--color-border)', borderRadius: 3 }} />;
  return (
    <div title={item.dname}>
      <Image
        src={getItemImageUrl(item.name)}
        alt={item.dname}
        width={36}
        height={26}
        style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
      />
    </div>
  );
}

function ItemsRow({ player, idMap }: { player: PlayerMatch; idMap: Record<number, { name: string; dname: string }> }) {
  const items = [player.item_0, player.item_1, player.item_2, player.item_3, player.item_4, player.item_5];
  const backpack = [player.backpack_0, player.backpack_1, player.backpack_2];
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {items.map((id, i) => <ItemIcon key={i} itemId={id} idMap={idMap} />)}
      <div style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 2px' }} />
      {backpack.map((id, i) => (
        <div key={i} style={{ opacity: 0.55 }}><ItemIcon itemId={id} idMap={idMap} /></div>
      ))}
      {player.item_neutral !== undefined && player.item_neutral !== 0 && (
        <>
          <div style={{ width: 1, height: 18, background: 'var(--color-border)', margin: '0 2px' }} />
          <div title="Neutral item" style={{ border: '1px solid rgba(201,162,39,0.5)', borderRadius: 3 }}>
            <ItemIcon itemId={player.item_neutral} idMap={idMap} />
          </div>
        </>
      )}
    </div>
  );
}

function HeroIcon({ heroId, heroes, size = 44 }: { heroId: number; heroes: Record<string, { name: string; localized_name: string }> | undefined; size?: number }) {
  const h = heroes?.[String(heroId)];
  if (!h) return <div style={{ width: size, height: Math.round(size * 0.56), background: 'var(--color-border)', borderRadius: 3 }} />;
  return (
    <Image
      src={getHeroImageUrl(h.name)}
      alt={h.localized_name}
      width={size}
      height={Math.round(size * 0.56)}
      style={{ borderRadius: 3, objectFit: 'cover' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function PlayerRow({ player, heroes, idMap, hasNetWorth, hasItems }: {
  player: PlayerMatch;
  heroes: Record<string, { name: string; localized_name: string }> | undefined;
  idMap: Record<number, { name: string; dname: string }>;
  hasNetWorth: boolean;
  hasItems: boolean;
}) {
  const kdaVal = kda(player.kills, player.deaths, player.assists);
  const heroName = heroes?.[String(player.hero_id)]?.localized_name || `Hero #${player.hero_id}`;
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HeroIcon heroId={player.hero_id} heroes={heroes} size={44} />
          <span style={{ fontSize: '11px', color: 'var(--color-muted)', maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {heroName}
          </span>
        </div>
      </td>
      <td style={{ fontSize: '13px', fontWeight: 500 }}>
        {player.name || player.personaname || `Player #${player.account_id}`}
      </td>
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#4dba87', fontWeight: 600 }}>{player.kills}</span>
        <span style={{ color: 'var(--color-muted)' }}>/</span>
        <span style={{ color: '#e74c3c' }}>{player.deaths}</span>
        <span style={{ color: 'var(--color-muted)' }}>/</span>
        <span>{player.assists}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ fontWeight: 600, color: kdaVal >= 4 ? 'var(--color-gold-bright)' : kdaVal >= 2 ? 'var(--color-text)' : 'var(--color-muted)' }}>
          {player.deaths === 0 ? '∞' : kdaVal.toFixed(2)}
        </span>
      </td>
      <td style={{ textAlign: 'center' }}>{player.gold_per_min}</td>
      <td style={{ textAlign: 'center' }}>{player.xp_per_min}</td>
      <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>{player.last_hits}</td>
      {hasNetWorth && (
        <td style={{ textAlign: 'center', color: 'var(--color-gold)' }}>
          {player.net_worth ? `${(player.net_worth / 1000).toFixed(1)}k` : '—'}
        </td>
      )}
      {hasItems && <td><ItemsRow player={player} idMap={idMap} /></td>}
    </tr>
  );
}

function DraftSection({ picksBans, heroes }: { picksBans: PickBan[]; heroes: Record<string, { name: string; localized_name: string }> | undefined }) {
  const sorted = [...picksBans].sort((a, b) => a.order - b.order);
  const rad = sorted.filter((p) => p.team === 0);
  const dire = sorted.filter((p) => p.team === 1);

  function ActionList({ actions, label }: { actions: PickBan[]; label: string }) {
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {actions.map((pb, i) => {
            const h = heroes?.[String(pb.hero_id)];
            return (
              <div key={i} title={`${pb.is_pick ? 'Pick' : 'Ban'}: ${h?.localized_name || pb.hero_id}`} style={{ position: 'relative' }}>
                <div style={{ opacity: pb.is_pick ? 1 : 0.4, border: `2px solid ${pb.is_pick ? 'rgba(77,186,135,0.5)' : 'rgba(192,57,43,0.5)'}`, borderRadius: 4, overflow: 'hidden' }}>
                  {h ? (
                    <Image src={getHeroImageUrl(h.name)} alt={h.localized_name} width={52} height={29} style={{ display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 52, height: 29, background: 'var(--color-border)' }} />
                  )}
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: '7px', textAlign: 'center', background: pb.is_pick ? 'rgba(77,186,135,0.9)' : 'rgba(192,57,43,0.9)', color: '#fff', fontWeight: 700, padding: '1px' }}>
                  {pb.is_pick ? 'PICK' : 'BAN'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Draft</div>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <ActionList actions={rad} label="Radiant" />
        <ActionList actions={dire} label="Dire" />
      </div>
    </div>
  );
}

function ObjectivesSection({ objectives, duration }: { objectives: MatchObjective[]; duration: number }) {
  const roshanKills = objectives.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
  const tormentors = objectives.filter((o) =>
    (o.type === 'building_kill' && (
      o.key?.toLowerCase().includes('tormentor') || o.unit?.toLowerCase().includes('tormentor')
    )) || o.type === 'CHAT_MESSAGE_TORMENTOR_KILL'
  );

  if (roshanKills.length === 0 && tormentors.length === 0) return null;

  const timeStr = (s: number) => {
    const t = Math.max(0, s);
    return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
  };
  const teamLabel = (t: number) => t === 2 ? 'Radiant' : 'Dire';
  const teamColor = (t: number) => t === 2 ? 'var(--color-radiant)' : 'var(--color-dire)';

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Key Events</div>
      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>

        {roshanKills.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              Roshan ({roshanKills.length}x)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {roshanKills.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: 'rgba(255,140,0,0.15)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.35)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '12px', minWidth: 28, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', minWidth: 46 }}>{timeStr(o.time)}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: teamColor(o.team) }}>{teamLabel(o.team)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tormentors.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              Tormentors ({tormentors.length}x)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {tormentors.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: 'rgba(147,51,234,0.15)', color: '#a855f7', border: '1px solid rgba(147,51,234,0.35)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '12px', minWidth: 28, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', minWidth: 46 }}>{timeStr(o.time)}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: teamColor(o.team) }}>{teamLabel(o.team)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline bar */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Timeline</div>
          <div style={{ position: 'relative', height: 28, background: 'var(--color-border)', borderRadius: 4 }}>
            {roshanKills.map((o, i) => {
              const pct = Math.min((o.time / duration) * 100, 99);
              return (
                <div key={i} title={`Roshan #${i + 1} — ${timeStr(o.time)}`}
                  style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, background: '#ff8c00', borderRadius: '50%', border: '2px solid var(--color-bg)', zIndex: 2 }} />
              );
            })}
            {tormentors.map((o, i) => {
              const pct = Math.min((o.time / duration) * 100, 99);
              return (
                <div key={i} title={`Tormentor #${i + 1} — ${timeStr(o.time)}`}
                  style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, background: '#a855f7', borderRadius: 2, border: '2px solid var(--color-bg)', zIndex: 2 }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, color: 'var(--color-dim)' }}>
            <span>0:00</span><span>{timeStr(Math.round(duration / 2))}</span><span>{timeStr(duration)}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--color-muted)' }}>
            <span><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff8c00', display: 'inline-block', marginRight: 4 }} />Roshan</span>
            <span><span style={{ width: 10, height: 10, borderRadius: 2, background: '#a855f7', display: 'inline-block', marginRight: 4 }} />Tormentor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const params = useParams();
  const matchId = Number(params.id);
  const { data: heroes } = useHeroConstants();
  const { data: itemConstants } = useQuery({
    queryKey: ['item-constants'],
    queryFn: getItemConstants,
    staleTime: Infinity,
  });

  const { data: match, isLoading, error } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => getMatch(matchId),
  });

  const idMap = itemConstants ? buildItemIdMap(itemConstants) : {};

  if (isLoading) return <LoadingSpinner text="Loading match data..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!match) return null;

  const radiantPlayers = match.players?.filter((p) => p.player_slot < 128) || [];
  const direPlayers = match.players?.filter((p) => p.player_slot >= 128) || [];
  const hasItems = radiantPlayers.some((p) => p.item_0 !== undefined && p.item_0 !== 0);
  const hasNetWorth = radiantPlayers.some((p) => p.net_worth !== undefined);

  function PlayerTable({ players, side, won }: { players: PlayerMatch[]; side: string; won: boolean }) {
    const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';
    const teamName = side === 'Radiant' ? (match!.radiant_name || 'Radiant') : (match!.dire_name || 'Dire');
    return (
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: '14px', color }}>{side} — {teamName}</span>
          {won && <span style={{ fontSize: '11px', background: `rgba(${side === 'Radiant' ? '77,186,135' : '192,57,43'},0.15)`, color, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>WINNER</span>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dota-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Hero</th><th>Player</th>
                <th style={{ textAlign: 'center' }}>K/D/A</th>
                <th style={{ textAlign: 'center' }}>KDA</th>
                <th style={{ textAlign: 'center' }}>GPM</th>
                <th style={{ textAlign: 'center' }}>XPM</th>
                <th style={{ textAlign: 'center' }}>LH</th>
                {hasNetWorth && <th style={{ textAlign: 'center' }}>NW</th>}
                {hasItems && <th>Items</th>}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <PlayerRow key={p.account_id || p.player_slot} player={p} heroes={heroes} idMap={idMap} hasNetWorth={hasNetWorth} hasItems={hasItems} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {match.leagueid && (
        <Link href={`/tournaments/${match.leagueid}/matches`} style={{ fontSize: '12px', color: 'var(--color-muted)', textDecoration: 'none' }}>
          ← Back to matches
        </Link>
      )}

      {/* Header */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'var(--color-radiant)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Radiant {match.radiant_win && '✓ Winner'}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>
              {match.radiant_name || 'Radiant'}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '0 20px' }}>
            <div style={{ fontSize: '36px', fontWeight: 900 }}>{match.radiant_score} : {match.dire_score}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: 4 }}>
              {formatDuration(match.duration)} · {formatDate(match.start_time)}
            </div>
            {match.patch && <div style={{ fontSize: '11px', color: 'var(--color-dim)', marginTop: 2 }}>Patch {match.patch}</div>}
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-dire)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Dire {!match.radiant_win && '✓ Winner'}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: !match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>
              {match.dire_name || 'Dire'}
            </div>
          </div>
        </div>
      </div>

      {match.picks_bans?.length > 0 && <DraftSection picksBans={match.picks_bans} heroes={heroes} />}
      {match.objectives && match.objectives.length > 0 && <ObjectivesSection objectives={match.objectives} duration={match.duration} />}
      <PlayerTable players={radiantPlayers} side="Radiant" won={match.radiant_win} />
      <PlayerTable players={direPlayers} side="Dire" won={!match.radiant_win} />

      <div style={{ fontSize: '12px', color: 'var(--color-dim)', textAlign: 'right' }}>
        Match ID: {match.match_id}
        {match.leagueid && <> · <Link href={`/tournaments/${match.leagueid}`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>League #{match.leagueid}</Link></>}
      </div>
    </div>
  );
}
