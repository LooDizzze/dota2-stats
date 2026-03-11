'use client';

import { useParams, useRouter } from 'next/navigation';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeStr(s: number) {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

// ─── Item icon ─────────────────────────────────────────────────────────────────

function ItemIcon({ itemId, idMap, size = 36 }: {
  itemId: number | undefined;
  idMap: Record<number, { name: string; dname: string }>;
  size?: number;
}) {
  const h = Math.round(size * 0.72);
  if (!itemId || itemId === 0) return <div style={{ width: size, height: h, background: 'rgba(26,39,64,0.6)', borderRadius: 3 }} />;
  const item = idMap[itemId];
  if (!item) return <div style={{ width: size, height: h, background: 'var(--color-border)', borderRadius: 3 }} />;
  return (
    <div title={item.dname}>
      <Image src={getItemImageUrl(item.name)} alt={item.dname} width={size} height={h}
        style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
    </div>
  );
}

function ItemsRow({ player, idMap }: { player: PlayerMatch; idMap: Record<number, { name: string; dname: string }> }) {
  const items = [player.item_0, player.item_1, player.item_2, player.item_3, player.item_4, player.item_5];
  const backpack = [player.backpack_0, player.backpack_1, player.backpack_2];
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {items.map((id, i) => <ItemIcon key={i} itemId={id} idMap={idMap} />)}
      <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
      {backpack.map((id, i) => <div key={i} style={{ opacity: 0.5 }}><ItemIcon itemId={id} idMap={idMap} size={28} /></div>)}
      {player.item_neutral != null && player.item_neutral !== 0 && (
        <>
          <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
          <div title="Neutral" style={{ border: '1px solid rgba(201,162,39,0.5)', borderRadius: 3 }}>
            <ItemIcon itemId={player.item_neutral} idMap={idMap} size={28} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Hero icon ─────────────────────────────────────────────────────────────────

function HeroIcon({ heroId, heroes, size = 48 }: {
  heroId: number;
  heroes: Record<string, { name: string; localized_name: string }> | undefined;
  size?: number;
}) {
  const h = heroes?.[String(heroId)];
  if (!h) return <div style={{ width: size, height: Math.round(size * 0.56), background: 'var(--color-border)', borderRadius: 3 }} />;
  return (
    <Image src={getHeroImageUrl(h.name)} alt={h.localized_name}
      width={size} height={Math.round(size * 0.56)}
      style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
  );
}

// ─── Gold advantage graph ──────────────────────────────────────────────────────

function GoldAdvGraph({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const W = 900, H = 120, PAD = 8;
  const inner = { w: W - PAD * 2, h: H - PAD * 2 };
  const max = Math.max(...data.map(Math.abs), 1000);
  const mid = PAD + inner.h / 2;

  const pts = data.map((v, i) => ({
    x: PAD + (i / (data.length - 1)) * inner.w,
    y: mid - (v / max) * (inner.h / 2),
  }));

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  // Fill areas
  const radArea = pts.filter((_, i) => data[i] >= 0);
  const direArea = pts.filter((_, i) => data[i] <= 0);

  function fillPath(segment: typeof pts, positive: boolean): string {
    if (segment.length < 2) return '';
    const line = segment.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const x0 = segment[0].x, x1 = segment[segment.length - 1].x;
    return `${line} L ${x1.toFixed(1)} ${mid} L ${x0.toFixed(1)} ${mid} Z`;
  }

  // Minute labels every 5 min
  const labels: number[] = [];
  for (let i = 0; i < data.length; i += 5) labels.push(i);

  const maxK = (max / 1000).toFixed(0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Zero line */}
        <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} stroke="var(--color-border-bright)" strokeWidth={1} />
        {/* Radiant fill */}
        <path d={fillPath(radArea, true)} fill="rgba(77,186,135,0.18)" />
        {/* Dire fill */}
        <path d={fillPath(direArea, false)} fill="rgba(192,57,43,0.18)" />
        {/* Main line */}
        <path d={path} fill="none" stroke="rgba(200,200,200,0.6)" strokeWidth={1.5} />
        {/* Minute labels */}
        {labels.map((min) => {
          const x = PAD + (min / (data.length - 1)) * inner.w;
          return <text key={min} x={x} y={H - 1} textAnchor="middle" fontSize={9} fill="rgba(107,126,158,0.8)">{min}&apos;</text>;
        })}
        {/* Y labels */}
        <text x={PAD} y={PAD + 6} fontSize={9} fill="rgba(77,186,135,0.7)">+{maxK}k</text>
        <text x={PAD} y={H - 10} fontSize={9} fill="rgba(192,57,43,0.7)">-{maxK}k</text>
      </svg>
    </div>
  );
}

// ─── Draft section ─────────────────────────────────────────────────────────────

function DraftSection({ picksBans, heroes }: {
  picksBans: PickBan[];
  heroes: Record<string, { name: string; localized_name: string }> | undefined;
}) {
  const sorted = [...picksBans].sort((a, b) => a.order - b.order);

  // Separate into phases based on order (Dota 2 CM draft: bans 1-6, picks 7-12, bans 13-16, picks 17-20)
  // Phase 1: order 0-5 (bans), Phase 2: order 6-11 (picks), Phase 3: order 12-15 (bans), Phase 4: order 16-19 (picks)
  const phases = [
    { label: 'Phase 1 — Bans', items: sorted.slice(0, 6) },
    { label: 'Phase 2 — Picks', items: sorted.slice(6, 12) },
    { label: 'Phase 3 — Bans', items: sorted.slice(12, 16) },
    { label: 'Phase 4 — Picks', items: sorted.slice(16, 20) },
  ].filter((p) => p.items.length > 0);

  function HeroCard({ pb, num }: { pb: PickBan; num: number }) {
    const h = heroes?.[String(pb.hero_id)];
    const radiant = pb.team === 0;
    const pickColor = radiant ? 'var(--color-radiant)' : 'var(--color-dire)';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{
          position: 'relative', borderRadius: 4, overflow: 'hidden',
          border: `2px solid ${pb.is_pick ? pickColor : 'rgba(107,126,158,0.4)'}`,
          opacity: pb.is_pick ? 1 : 0.55,
        }}>
          {h ? (
            <Image src={getHeroImageUrl(h.name)} alt={h.localized_name} width={56} height={32}
              style={{ display: 'block', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
          ) : (
            <div style={{ width: 56, height: 32, background: 'var(--color-border)' }} />
          )}
          {/* Order number */}
          <div style={{ position: 'absolute', top: 0, left: 0, fontSize: 8, fontWeight: 700, background: 'rgba(0,0,0,0.7)', color: '#aaa', padding: '1px 3px', borderRadius: '0 0 3px 0' }}>{num}</div>
          {/* Pick/Ban label */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 7, textAlign: 'center', background: pb.is_pick ? `${pickColor}dd` : 'rgba(60,60,60,0.85)', color: '#fff', fontWeight: 800, padding: '1px', letterSpacing: '0.05em' }}>
            {pb.is_pick ? (radiant ? 'RAD' : 'DIRE') : 'BAN'}
          </div>
        </div>
        <div style={{ fontSize: 9, color: 'var(--color-muted)', maxWidth: 56, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h?.localized_name || '?'}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 14 }}>Draft Order</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {phases.map((phase, pi) => (
          <div key={pi}>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{phase.label}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {phase.items.map((pb, i) => <HeroCard key={i} pb={pb} num={pb.order + 1} />)}
            </div>
          </div>
        ))}
      </div>
      {/* Radiant/Dire legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--color-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--color-radiant)', marginRight: 4 }} />Radiant pick</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--color-dire)', marginRight: 4 }} />Dire pick</span>
        <span style={{ opacity: 0.5 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--color-border-bright)', marginRight: 4 }} />Ban</span>
      </div>
    </div>
  );
}

// ─── Objectives section ────────────────────────────────────────────────────────

function ObjectivesSection({ objectives, duration }: { objectives: MatchObjective[]; duration: number }) {
  const roshanKills = objectives.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
  const tormentors = objectives.filter((o) =>
    (o.type === 'building_kill' && (o.key?.toLowerCase().includes('tormentor') || o.unit?.toLowerCase().includes('tormentor')))
    || o.type === 'CHAT_MESSAGE_TORMENTOR_KILL'
  );
  if (roshanKills.length === 0 && tormentors.length === 0) return null;

  const teamColor = (t: number) => t === 2 ? 'var(--color-radiant)' : 'var(--color-dire)';
  const teamLabel = (t: number) => t === 2 ? 'Radiant' : 'Dire';

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: 14 }}>Key Objectives</div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        {roshanKills.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#ff8c00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Roshan ×{roshanKills.length}</div>
            {roshanKills.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ background: 'rgba(255,140,0,0.15)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.3)', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44 }}>{timeStr(o.time)}</span>
                <span style={{ fontSize: 12, color: teamColor(o.team), fontWeight: 600 }}>{teamLabel(o.team)}</span>
              </div>
            ))}
          </div>
        )}
        {tormentors.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tormentor ×{tormentors.length}</div>
            {tormentors.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44 }}>{timeStr(o.time)}</span>
                <span style={{ fontSize: 12, color: teamColor(o.team), fontWeight: 600 }}>{teamLabel(o.team)}</span>
              </div>
            ))}
          </div>
        )}
        {/* Timeline */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Timeline</div>
          <div style={{ position: 'relative', height: 24, background: 'var(--color-border)', borderRadius: 4 }}>
            {roshanKills.map((o, i) => {
              const pct = Math.min((o.time / duration) * 100, 99);
              return <div key={i} title={`Roshan #${i + 1} — ${timeStr(o.time)}`}
                style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, background: '#ff8c00', borderRadius: '50%', border: '2px solid var(--color-bg)', zIndex: 2 }} />;
            })}
            {tormentors.map((o, i) => {
              const pct = Math.min((o.time / duration) * 100, 99);
              return <div key={i} title={`Tormentor #${i + 1} — ${timeStr(o.time)}`}
                style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, background: '#a855f7', borderRadius: 2, border: '2px solid var(--color-bg)', zIndex: 2 }} />;
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: 'var(--color-dim)' }}>
            <span>0:00</span><span>{timeStr(Math.round(duration / 2))}</span><span>{timeStr(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Player scorecard row ──────────────────────────────────────────────────────

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: '100%', height: 3, background: 'var(--color-border)', borderRadius: 2, marginTop: 3 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function PlayerRow({ player, heroes, idMap, maxNW, maxDmg, maxTwr, maxHeal }: {
  player: PlayerMatch;
  heroes: Record<string, { name: string; localized_name: string }> | undefined;
  idMap: Record<number, { name: string; dname: string }>;
  maxNW: number; maxDmg: number; maxTwr: number; maxHeal: number;
}) {
  const kdaVal = kda(player.kills, player.deaths, player.assists);
  const heroName = heroes?.[String(player.hero_id)]?.localized_name || `Hero #${player.hero_id}`;
  const hasDmg = player.hero_damage != null && player.hero_damage > 0;
  const hasTwr = player.tower_damage != null && player.tower_damage > 0;
  const hasHeal = player.hero_healing != null && player.hero_healing > 0;

  return (
    <tr>
      {/* Hero + name */}
      <td style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flexShrink: 0 }}>
            <HeroIcon heroId={player.hero_id} heroes={heroes} size={48} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.name || player.personaname || `Player #${player.account_id || player.player_slot}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroName}</div>
          </div>
        </div>
      </td>
      {/* Level */}
      <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>
        {player.level ?? '—'}
      </td>
      {/* KDA */}
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#4dba87', fontWeight: 600 }}>{player.kills}</span>
        <span style={{ color: 'var(--color-dim)' }}> / </span>
        <span style={{ color: '#e74c3c', fontWeight: 600 }}>{player.deaths}</span>
        <span style={{ color: 'var(--color-dim)' }}> / </span>
        <span style={{ fontWeight: 500 }}>{player.assists}</span>
      </td>
      {/* KDA ratio */}
      <td style={{ textAlign: 'center' }}>
        <span style={{ fontWeight: 700, color: kdaVal >= 5 ? 'var(--color-gold-bright)' : kdaVal >= 3 ? 'var(--color-text)' : 'var(--color-muted)' }}>
          {player.deaths === 0 ? '∞' : kdaVal.toFixed(2)}
        </span>
      </td>
      {/* LH / DN */}
      <td style={{ textAlign: 'center', fontSize: 13 }}>
        <span>{player.last_hits}</span>
        <span style={{ color: 'var(--color-dim)', fontSize: 11 }}> / {player.denies}</span>
      </td>
      {/* GPM / XPM */}
      <td style={{ textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--color-gold)' }}>{player.gold_per_min}</span>
        <span style={{ color: 'var(--color-dim)', fontSize: 10 }}> / </span>
        <span style={{ color: '#7c9cbf' }}>{player.xp_per_min}</span>
      </td>
      {/* Net worth */}
      <td style={{ minWidth: 80 }}>
        {player.net_worth != null ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-gold)', textAlign: 'right' }}>{fmt(player.net_worth)}</div>
            <StatBar value={player.net_worth} max={maxNW} color="rgba(201,162,39,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      {/* Hero Damage */}
      <td style={{ minWidth: 80 }}>
        {hasDmg ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e74c3c', textAlign: 'right' }}>{fmt(player.hero_damage)}</div>
            <StatBar value={player.hero_damage!} max={maxDmg} color="rgba(231,76,60,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      {/* Tower Damage */}
      <td style={{ minWidth: 72 }}>
        {hasTwr ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f0a000', textAlign: 'right' }}>{fmt(player.tower_damage)}</div>
            <StatBar value={player.tower_damage!} max={maxTwr} color="rgba(240,160,0,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      {/* Heals */}
      <td style={{ minWidth: 72 }}>
        {hasHeal ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#4dba87', textAlign: 'right' }}>{fmt(player.hero_healing)}</div>
            <StatBar value={player.hero_healing!} max={maxHeal} color="rgba(77,186,135,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)', fontSize: 11 }}>—</span>}
      </td>
      {/* Items */}
      <td><ItemsRow player={player} idMap={idMap} /></td>
    </tr>
  );
}

// ─── Player table ──────────────────────────────────────────────────────────────

function PlayerTable({ players, side, won, heroes, idMap, allPlayers }: {
  players: PlayerMatch[];
  side: 'Radiant' | 'Dire';
  won: boolean;
  heroes: Record<string, { name: string; localized_name: string }> | undefined;
  idMap: Record<number, { name: string; dname: string }>;
  allPlayers: PlayerMatch[];
}) {
  const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';

  // Compute max values across ALL players for relative bars
  const maxNW = Math.max(...allPlayers.map((p) => p.net_worth ?? 0));
  const maxDmg = Math.max(...allPlayers.map((p) => p.hero_damage ?? 0));
  const maxTwr = Math.max(...allPlayers.map((p) => p.tower_damage ?? 0));
  const maxHeal = Math.max(...allPlayers.map((p) => p.hero_healing ?? 0));

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{side}</span>
        {won && (
          <span style={{ fontSize: 11, background: `rgba(${side === 'Radiant' ? '77,186,135' : '192,57,43'},0.15)`, color, padding: '2px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.05em' }}>
            VICTORY
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dota-table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Hero / Player</th>
              <th style={{ textAlign: 'center' }}>LVL</th>
              <th style={{ textAlign: 'center' }}>K / D / A</th>
              <th style={{ textAlign: 'center' }}>KDA</th>
              <th style={{ textAlign: 'center' }}>LH / DN</th>
              <th style={{ textAlign: 'center' }}>GPM / XPM</th>
              <th style={{ textAlign: 'right', minWidth: 80 }}>Net Worth</th>
              <th style={{ textAlign: 'right', minWidth: 80 }}>Hero Dmg</th>
              <th style={{ textAlign: 'right', minWidth: 72 }}>Twr Dmg</th>
              <th style={{ textAlign: 'right', minWidth: 72 }}>Heals</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <PlayerRow key={p.account_id || p.player_slot} player={p} heroes={heroes} idMap={idMap}
                maxNW={maxNW} maxDmg={maxDmg} maxTwr={maxTwr} maxHeal={maxHeal} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = Number(params.id);
  const { data: heroes } = useHeroConstants();
  const { data: itemConstants } = useQuery({ queryKey: ['item-constants'], queryFn: getItemConstants, staleTime: Infinity });
  const { data: match, isLoading, error } = useQuery({ queryKey: ['match', matchId], queryFn: () => getMatch(matchId) });

  const idMap = itemConstants ? buildItemIdMap(itemConstants) : {};

  if (isLoading) return <LoadingSpinner text="Loading match data..." />;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!match) return null;

  const radiantPlayers = match.players?.filter((p) => p.player_slot < 128) || [];
  const direPlayers = match.players?.filter((p) => p.player_slot >= 128) || [];
  const allPlayers = [...radiantPlayers, ...direPlayers];

  const seriesLabel = match.series_type === 1 ? 'Bo3' : match.series_type === 2 ? 'Bo5' : null;

  function analyzeDraft() {
    if (!match?.picks_bans?.length) return;
    const pb = match.picks_bans;
    function padTo<T>(arr: T[], len: number, fill: T): T[] {
      return [...arr.slice(0, len), ...Array(Math.max(0, len - arr.length)).fill(fill)];
    }
    const radiantPicks = padTo(pb.filter((x) => x.is_pick && x.team === 0).map((x) => x.hero_id), 5, null);
    const direPicks   = padTo(pb.filter((x) => x.is_pick && x.team === 1).map((x) => x.hero_id), 5, null);
    const radiantBans = padTo(pb.filter((x) => !x.is_pick && x.team === 0).map((x) => x.hero_id), 7, null);
    const direBans    = padTo(pb.filter((x) => !x.is_pick && x.team === 1).map((x) => x.hero_id), 7, null);
    localStorage.setItem('dota2stats_draft_import', JSON.stringify({
      radiant_picks: radiantPicks,
      dire_picks: direPicks,
      radiant_bans: radiantBans,
      dire_bans: direBans,
      radiant_name: match.radiant_name || '',
      dire_name: match.dire_name || '',
    }));
    router.push('/draft');
  }

  const hasDraft = (match.picks_bans?.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {match.leagueid ? (
          <Link href={`/tournaments/${match.leagueid}/matches`} style={{ fontSize: 12, color: 'var(--color-muted)', textDecoration: 'none' }}>
            ← Back to matches
          </Link>
        ) : <span />}
        {hasDraft && (
          <button
            onClick={analyzeDraft}
            style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(77,186,135,0.4)', background: 'rgba(77,186,135,0.1)', color: 'var(--color-radiant)', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(77,186,135,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(77,186,135,0.1)'; }}
          >
            ⚔ Analyze Draft
          </button>
        )}
      </div>

      {/* Match header */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
          {/* Radiant */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-radiant)', marginBottom: 4 }}>
              Radiant{match.radiant_win && ' · WINNER'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>
              {match.radiant_name || 'Radiant'}
            </div>
          </div>

          {/* Score */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '0.04em', lineHeight: 1 }}>
              <span style={{ color: match.radiant_win ? 'var(--color-radiant)' : 'var(--color-muted)' }}>{match.radiant_score}</span>
              <span style={{ color: 'var(--color-dim)', margin: '0 10px' }}>:</span>
              <span style={{ color: !match.radiant_win ? 'var(--color-dire)' : 'var(--color-muted)' }}>{match.dire_score}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>
              {formatDuration(match.duration)} · {formatDate(match.start_time)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              {match.patch && <span style={{ fontSize: 11, background: 'rgba(77,186,135,0.1)', border: '1px solid rgba(77,186,135,0.2)', color: 'var(--color-muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Patch {match.patch}</span>}
              {seriesLabel && <span style={{ fontSize: 11, background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.2)', color: 'var(--color-gold)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{seriesLabel}</span>}
              <span style={{ fontSize: 11, color: 'var(--color-dim)', padding: '2px 8px' }}>#{match.match_id}</span>
            </div>
          </div>

          {/* Dire */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-dire)', marginBottom: 4 }}>
              Dire{!match.radiant_win && ' · WINNER'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: !match.radiant_win ? 'var(--color-dire)' : 'var(--color-muted)' }}>
              {match.dire_name || 'Dire'}
            </div>
          </div>
        </div>
      </div>

      {/* Gold advantage graph */}
      {match.radiant_gold_adv && match.radiant_gold_adv.length > 1 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Gold Advantage</span>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-muted)' }}>
              <span style={{ color: 'var(--color-radiant)' }}>▲ Radiant</span>
              <span style={{ color: 'var(--color-dire)' }}>▼ Dire</span>
            </div>
          </div>
          <GoldAdvGraph data={match.radiant_gold_adv} />
        </div>
      )}

      {/* Draft */}
      {match.picks_bans?.length > 0 && <DraftSection picksBans={match.picks_bans} heroes={heroes} />}

      {/* Objectives */}
      {match.objectives && match.objectives.length > 0 && (
        <ObjectivesSection objectives={match.objectives} duration={match.duration} />
      )}

      {/* Scorecards */}
      <PlayerTable players={radiantPlayers} side="Radiant" won={match.radiant_win} heroes={heroes} idMap={idMap} allPlayers={allPlayers} />
      <PlayerTable players={direPlayers} side="Dire" won={!match.radiant_win} heroes={heroes} idMap={idMap} allPlayers={allPlayers} />

      <div style={{ fontSize: 11, color: 'var(--color-dim)', textAlign: 'right' }}>
        Match #{match.match_id}
        {match.leagueid && <> · <Link href={`/tournaments/${match.leagueid}`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>League #{match.leagueid}</Link></>}
      </div>
    </div>
  );
}
