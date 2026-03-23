'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, ReferenceLine,
} from 'recharts';
import {
  getMatch, getHeroImageUrl, getItemImageUrl, buildItemIdMap,
  getItemConstants, formatDuration,
} from '@/lib/opendota';
import { formatDate, kda } from '@/lib/utils';
import { PlayerMatch, PickBan, MatchObjective, MatchDetail } from '@/lib/types';
import LoadingSpinner, { ErrorMessage } from '@/components/LoadingSpinner';

// ─── Local types ───────────────────────────────────────────────────────────────

type HeroRecord = Record<string, { id?: number; name: string; localized_name: string }> | undefined;
type ItemMap = Record<number, { name: string; dname: string }>;
type Tab = 'overview' | 'graphs' | 'combat' | 'farm' | 'vision' | 'drafts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'graphs',   label: 'Graphs'   },
  { id: 'combat',   label: 'Combat'   },
  { id: 'farm',     label: 'Farm'     },
  { id: 'vision',   label: 'Vision'   },
  { id: 'drafts',   label: 'Drafts'   },
];

const RAD_COLORS = ['#4dba87', '#00e5a0', '#2ea870', '#6ee8b2', '#1a7d55'];
const DIRE_COLORS = ['#e74c3c', '#ff7043', '#c62828', '#ff8a65', '#b71c1c'];

const TOOLTIP_STYLE = {
  background: '#1a2740',
  border: '1px solid #2a3a5a',
  fontSize: 12,
  color: '#c8d4e8',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined): string {
  if (n == null || n === 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeStr(s: number) {
  const t = Math.max(0, s);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

function coordToPercent(v: number): number {
  return Math.max(0, Math.min(100, (v / 255) * 100));
}

// ─── Shared micro-components ────────────────────────────────────────────────────

function HeroIcon({ heroId, heroes, size = 48 }: {
  heroId: number; heroes: HeroRecord; size?: number;
}) {
  const h = heroes?.[String(heroId)];
  if (!h) return (
    <div style={{ width: size, height: Math.round(size * 0.56), background: 'var(--color-border)', borderRadius: 3 }} />
  );
  return (
    <Image src={getHeroImageUrl(h.name)} alt={h.localized_name}
      width={size} height={Math.round(size * 0.56)} unoptimized
      style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
  );
}

function ItemIcon({ itemId, idMap, size = 36 }: {
  itemId: number | undefined; idMap: ItemMap; size?: number;
}) {
  const h = Math.round(size * 0.72);
  if (!itemId || itemId === 0) return (
    <div style={{ width: size, height: h, background: 'rgba(26,39,64,0.6)', borderRadius: 3 }} />
  );
  const item = idMap[itemId];
  if (!item) return (
    <div style={{ width: size, height: h, background: 'var(--color-border)', borderRadius: 3 }} />
  );
  return (
    <div title={item.dname}>
      <Image src={getItemImageUrl(item.name)} alt={item.dname} width={size} height={h} unoptimized
        style={{ borderRadius: 3, objectFit: 'cover', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
    </div>
  );
}

function ItemsRow({ player, idMap }: { player: PlayerMatch; idMap: ItemMap }) {
  const items = [player.item_0, player.item_1, player.item_2, player.item_3, player.item_4, player.item_5];
  const backpack = [player.backpack_0, player.backpack_1, player.backpack_2];
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {items.map((id, i) => <ItemIcon key={i} itemId={id} idMap={idMap} />)}
      <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
      {backpack.map((id, i) => (
        <div key={i} style={{ opacity: 0.5 }}><ItemIcon itemId={id} idMap={idMap} size={28} /></div>
      ))}
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

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: '100%', height: 3, background: 'var(--color-border)', borderRadius: 2, marginTop: 3 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  );
}

// ─── Tab navigation ─────────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border)' }}>
      {TABS.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--color-radiant)' : '2px solid transparent',
            marginBottom: -2,
            color: active === t.id ? 'var(--color-text)' : 'var(--color-muted)',
            fontWeight: active === t.id ? 700 : 400,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { if (active !== t.id) e.currentTarget.style.color = 'var(--color-text)'; }}
          onMouseLeave={(e) => { if (active !== t.id) e.currentTarget.style.color = 'var(--color-muted)'; }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview: player rows + table ─────────────────────────────────────────────

function PlayerRow({ player, heroes, idMap, maxNW, maxDmg, maxTwr, maxHeal }: {
  player: PlayerMatch; heroes: HeroRecord; idMap: ItemMap;
  maxNW: number; maxDmg: number; maxTwr: number; maxHeal: number;
}) {
  const kdaVal = kda(player.kills, player.deaths, player.assists);
  const heroName = heroes?.[String(player.hero_id)]?.localized_name || `Hero #${player.hero_id}`;

  return (
    <tr>
      <td style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flexShrink: 0 }}><HeroIcon heroId={player.hero_id} heroes={heroes} size={48} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.name || player.personaname || `Player #${player.account_id || player.player_slot}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {heroName}
            </div>
          </div>
        </div>
      </td>
      <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--color-gold)' }}>
        {player.level ?? '—'}
      </td>
      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#4dba87', fontWeight: 600 }}>{player.kills}</span>
        <span style={{ color: 'var(--color-dim)' }}> / </span>
        <span style={{ color: '#e74c3c', fontWeight: 600 }}>{player.deaths}</span>
        <span style={{ color: 'var(--color-dim)' }}> / </span>
        <span style={{ fontWeight: 500 }}>{player.assists}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span style={{ fontWeight: 700, color: kdaVal >= 5 ? 'var(--color-gold)' : kdaVal >= 3 ? 'var(--color-text)' : 'var(--color-muted)' }}>
          {player.deaths === 0 ? '∞' : kdaVal.toFixed(2)}
        </span>
      </td>
      <td style={{ textAlign: 'center', fontSize: 13 }}>
        <span>{player.last_hits}</span>
        <span style={{ color: 'var(--color-dim)', fontSize: 11 }}> / {player.denies}</span>
      </td>
      <td style={{ textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--color-gold)' }}>{player.gold_per_min}</span>
        <span style={{ color: 'var(--color-dim)', fontSize: 10 }}> / </span>
        <span style={{ color: '#7c9cbf' }}>{player.xp_per_min}</span>
      </td>
      <td style={{ minWidth: 80 }}>
        {player.net_worth != null ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-gold)', textAlign: 'right' }}>{fmt(player.net_worth)}</div>
            <StatBar value={player.net_worth} max={maxNW} color="rgba(201,162,39,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      <td style={{ minWidth: 80 }}>
        {player.hero_damage ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e74c3c', textAlign: 'right' }}>{fmt(player.hero_damage)}</div>
            <StatBar value={player.hero_damage} max={maxDmg} color="rgba(231,76,60,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      <td style={{ minWidth: 72 }}>
        {player.tower_damage ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f0a000', textAlign: 'right' }}>{fmt(player.tower_damage)}</div>
            <StatBar value={player.tower_damage} max={maxTwr} color="rgba(240,160,0,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)' }}>—</span>}
      </td>
      <td style={{ minWidth: 72 }}>
        {player.hero_healing ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#4dba87', textAlign: 'right' }}>{fmt(player.hero_healing)}</div>
            <StatBar value={player.hero_healing} max={maxHeal} color="rgba(77,186,135,0.6)" />
          </div>
        ) : <span style={{ color: 'var(--color-dim)', fontSize: 11 }}>—</span>}
      </td>
      <td><ItemsRow player={player} idMap={idMap} /></td>
    </tr>
  );
}

function PlayerTable({ players, side, won, heroes, idMap, allPlayers }: {
  players: PlayerMatch[]; side: 'Radiant' | 'Dire'; won: boolean;
  heroes: HeroRecord; idMap: ItemMap; allPlayers: PlayerMatch[];
}) {
  const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';
  const maxNW   = Math.max(...allPlayers.map((p) => p.net_worth ?? 0), 1);
  const maxDmg  = Math.max(...allPlayers.map((p) => p.hero_damage ?? 0), 1);
  const maxTwr  = Math.max(...allPlayers.map((p) => p.tower_damage ?? 0), 1);
  const maxHeal = Math.max(...allPlayers.map((p) => p.hero_healing ?? 0), 1);

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

// ─── Objectives section ─────────────────────────────────────────────────────────

function ObjectivesSection({ objectives, duration }: { objectives: MatchObjective[]; duration: number }) {
  const roshanKills = objectives.filter((o) => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
  const tormentors  = objectives.filter((o) =>
    (o.type === 'building_kill' && (o.key?.toLowerCase().includes('tormentor') || o.unit?.toLowerCase().includes('tormentor')))
    || o.type === 'CHAT_MESSAGE_TORMENTOR_KILL'
  );
  if (roshanKills.length === 0 && tormentors.length === 0) return null;

  const teamColor = (t: number) => t === 2 ? 'var(--color-radiant)' : 'var(--color-dire)';
  const teamLabel = (t: number) => t === 2 ? 'Radiant' : 'Dire';

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Key Objectives</div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        {roshanKills.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: '#ff8c00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Roshan ×{roshanKills.length}
            </div>
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
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Tormentor ×{tormentors.length}
            </div>
            {tormentors.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44 }}>{timeStr(o.time)}</span>
                <span style={{ fontSize: 12, color: teamColor(o.team), fontWeight: 600 }}>{teamLabel(o.team)}</span>
              </div>
            ))}
          </div>
        )}
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

// ─── Drafts section ─────────────────────────────────────────────────────────────

function DraftSection({ picksBans, heroes }: { picksBans: PickBan[]; heroes: HeroRecord }) {
  const sorted = [...picksBans].sort((a, b) => a.order - b.order);
  const phases = [
    { label: 'Phase 1 — Bans',  items: sorted.slice(0, 6)   },
    { label: 'Phase 2 — Picks', items: sorted.slice(6, 12)  },
    { label: 'Phase 3 — Bans',  items: sorted.slice(12, 16) },
    { label: 'Phase 4 — Picks', items: sorted.slice(16, 20) },
  ].filter((p) => p.items.length > 0);

  function HeroCard({ pb, num }: { pb: PickBan; num: number }) {
    const h = heroes?.[String(pb.hero_id)];
    const radiant = pb.team === 0;
    const pickColor = radiant ? 'var(--color-radiant)' : 'var(--color-dire)';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: `2px solid ${pb.is_pick ? pickColor : 'rgba(107,126,158,0.4)'}`, opacity: pb.is_pick ? 1 : 0.55 }}>
          {h ? (
            <Image src={getHeroImageUrl(h.name)} alt={h.localized_name} width={56} height={32} unoptimized
              style={{ display: 'block', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
          ) : (
            <div style={{ width: 56, height: 32, background: 'var(--color-border)' }} />
          )}
          <div style={{ position: 'absolute', top: 0, left: 0, fontSize: 8, fontWeight: 700, background: 'rgba(0,0,0,0.7)', color: '#aaa', padding: '1px 3px', borderRadius: '0 0 3px 0' }}>{num}</div>
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
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {phases.map((phase, pi) => (
          <div key={pi}>
            <div style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {phase.label}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {phase.items.map((pb, i) => <HeroCard key={i} pb={pb} num={pb.order + 1} />)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--color-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--color-radiant)', marginRight: 4 }} />Radiant pick</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--color-dire)', marginRight: 4 }} />Dire pick</span>
        <span style={{ opacity: 0.5 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#4a5568', marginRight: 4 }} />Ban</span>
      </div>
    </div>
  );
}

// ─── Graphs tab ─────────────────────────────────────────────────────────────────

function GraphsTab({ match }: { match: MatchDetail }) {
  const fmtK = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000) return `${(v / 1000).toFixed(0)}k`;
    return String(v);
  };

  function AdvChart({ data, title, gradId }: { data: number[]; title: string; gradId: string }) {
    if (data.length < 2) {
      return (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>No data available for this match.</div>
        </div>
      );
    }

    const chartData = data.map((v, i) => ({
      min: i,
      radiant: v > 0 ? v : 0,
      dire: v < 0 ? v : 0,
    }));

    return (
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
            <span style={{ color: 'var(--color-radiant)' }}>▲ Radiant lead</span>
            <span style={{ color: 'var(--color-dire)' }}>▼ Dire lead</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 50 }}>
            <defs>
              <linearGradient id={`${gradId}-rad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4dba87" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#4dba87" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id={`${gradId}-dire`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%"  stopColor="#e74c3c" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#e74c3c" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,126,158,0.12)" />
            <XAxis dataKey="min" tickFormatter={(v) => `${v}'`} tick={{ fontSize: 10, fill: '#6b7e9e' }} interval={4} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#6b7e9e' }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Minute ${l}`}
              formatter={(value: unknown, name: string | number | undefined) => {
                const v = value as number;
                if (v === 0) return [null, null];
                return [`${name === 'radiant' ? 'Radiant' : 'Dire'} +${fmtK(Math.abs(v))}`, ''] as [string, string];
              }} />
            <ReferenceLine y={0} stroke="rgba(107,126,158,0.5)" strokeWidth={1.5} />
            <Area type="monotone" dataKey="radiant" stroke="#4dba87" strokeWidth={2}
              fill={`url(#${gradId}-rad)`} baseValue={0} isAnimationActive={false} name="radiant" />
            <Area type="monotone" dataKey="dire" stroke="#e74c3c" strokeWidth={2}
              fill={`url(#${gradId}-dire)`} baseValue={0} isAnimationActive={false} name="dire" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AdvChart data={match.radiant_gold_adv || []} title="Gold Advantage" gradId="gold" />
      <AdvChart data={match.radiant_xp_adv   || []} title="XP Advantage"   gradId="xp"   />
    </div>
  );
}

// ─── Combat tab ─────────────────────────────────────────────────────────────────

function CombatTab({ radiant, dire, heroes }: {
  radiant: PlayerMatch[]; dire: PlayerMatch[]; heroes: HeroRecord;
}) {
  const all = [...radiant, ...dire];
  const maxDmg   = Math.max(...all.map((p) => p.hero_damage   || 0), 1);
  const maxTwr   = Math.max(...all.map((p) => p.tower_damage  || 0), 1);
  const maxHeal  = Math.max(...all.map((p) => p.hero_healing  || 0), 1);
  const maxTaken = Math.max(...all.map((p) => p.damage_taken  || 0), 1);

  function CombatRow({ p, teamColor }: { p: PlayerMatch; teamColor: string }) {
    const heroName    = heroes?.[String(p.hero_id)]?.localized_name || `Hero #${p.hero_id}`;
    const displayName = p.name || p.personaname || heroName;

    function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
      const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color }}>{label}</span>
            <span style={{ fontWeight: 600, color: value > 0 ? 'var(--color-text)' : 'var(--color-dim)' }}>{fmt(value) === '—' && value === 0 ? '0' : fmt(value)}</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.2s' }} />
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(107,126,158,0.08)' }}>
        <div style={{ flexShrink: 0 }}><HeroIcon heroId={p.hero_id} heroes={heroes} size={42} /></div>
        <div style={{ minWidth: 110, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: teamColor }}>{displayName}</div>
          <div style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heroName}</div>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Bar value={p.hero_damage   || 0} max={maxDmg}   color="#e74c3c" label="Hero Dmg"  />
          <Bar value={p.tower_damage  || 0} max={maxTwr}   color="#f0a000" label="Twr Dmg"   />
          <Bar value={p.hero_healing  || 0} max={maxHeal}  color="#4dba87" label="Healing"   />
          <Bar value={p.damage_taken  || 0} max={maxTaken} color="#9b59b6" label="Dmg Taken" />
        </div>
      </div>
    );
  }

  function TeamSection({ players, side }: { players: PlayerMatch[]; side: 'Radiant' | 'Dire' }) {
    const color = side === 'Radiant' ? 'var(--color-radiant)' : 'var(--color-dire)';
    const totalDmg = players.reduce((s, p) => s + (p.hero_damage || 0), 0);
    return (
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color }}>{side}</span>
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Total hero dmg: {fmt(totalDmg)}</span>
        </div>
        {players.map((p) => <CombatRow key={p.player_slot} p={p} teamColor={color} />)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TeamSection players={radiant} side="Radiant" />
      <TeamSection players={dire}    side="Dire"    />
    </div>
  );
}

// ─── Farm tab ───────────────────────────────────────────────────────────────────

function FarmTab({ radiant, dire, heroes }: {
  radiant: PlayerMatch[]; dire: PlayerMatch[]; heroes: HeroRecord;
}) {
  const all = [...radiant, ...dire];
  const hasLh   = all.some((p) => p.lh_t   && p.lh_t.length   > 0);
  const hasGold = all.some((p) => p.gold_t  && p.gold_t.length  > 0);

  if (!hasLh && !hasGold) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: 0 }}>
          Detailed farm timeline data is not available for this match.
        </p>
      </div>
    );
  }

  function buildData(key: 'lh_t' | 'gold_t') {
    const len = Math.max(...all.map((p) => p[key]?.length || 0));
    return Array.from({ length: len }, (_, i) => {
      const entry: Record<string, number> = { min: i };
      all.forEach((p) => {
        const label = heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`;
        entry[label] = p[key]?.[i] ?? 0;
      });
      return entry;
    });
  }

  const lhData   = hasLh   ? buildData('lh_t')   : [];
  const goldData = hasGold ? buildData('gold_t')  : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {hasLh && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Last Hits Timeline</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lhData} margin={{ top: 10, right: 20, bottom: 10, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,126,158,0.12)" />
              <XAxis dataKey="min" tickFormatter={(v) => `${v}'`} tick={{ fontSize: 10, fill: '#6b7e9e' }} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7e9e' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Minute ${l}`} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {radiant.map((p, i) => (
                <Line key={p.player_slot} type="monotone" isAnimationActive={false}
                  dataKey={heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`}
                  stroke={RAD_COLORS[i % 5]} strokeWidth={1.5} dot={false} />
              ))}
              {dire.map((p, i) => (
                <Line key={p.player_slot} type="monotone" isAnimationActive={false}
                  dataKey={heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`}
                  stroke={DIRE_COLORS[i % 5]} strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 20, marginTop: 4, fontSize: 11, color: 'var(--color-muted)' }}>
            <span style={{ color: 'var(--color-radiant)' }}>— Radiant</span>
            <span style={{ color: 'var(--color-dire)' }}>- - Dire</span>
          </div>
        </div>
      )}

      {hasGold && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Net Worth Timeline</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={goldData} margin={{ top: 10, right: 20, bottom: 10, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,126,158,0.12)" />
              <XAxis dataKey="min" tickFormatter={(v) => `${v}'`} tick={{ fontSize: 10, fill: '#6b7e9e' }} interval={4} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#6b7e9e' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Minute ${l}`}
                formatter={(value: unknown) => [`${((value as number) / 1000).toFixed(1)}k`, '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {radiant.map((p, i) => (
                <Line key={p.player_slot} type="monotone" isAnimationActive={false}
                  dataKey={heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`}
                  stroke={RAD_COLORS[i % 5]} strokeWidth={1.5} dot={false} />
              ))}
              {dire.map((p, i) => (
                <Line key={p.player_slot} type="monotone" isAnimationActive={false}
                  dataKey={heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`}
                  stroke={DIRE_COLORS[i % 5]} strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Vision tab ─────────────────────────────────────────────────────────────────

function VisionTab({ radiant, dire, heroes }: {
  radiant: PlayerMatch[]; dire: PlayerMatch[]; heroes: HeroRecord;
}) {
  const all = [...radiant, ...dire];
  const allObs = all.flatMap((p, gi) =>
    (p.obs_log || []).map((w) => ({ ...w, isRadiant: p.player_slot < 128, color: p.player_slot < 128 ? RAD_COLORS[gi % 5] : DIRE_COLORS[(gi - 5) % 5] }))
  );
  const allSen = all.flatMap((p, gi) =>
    (p.sen_log || []).map((w) => ({ ...w, isRadiant: p.player_slot < 128, color: p.player_slot < 128 ? RAD_COLORS[gi % 5] : DIRE_COLORS[(gi - 5) % 5] }))
  );
  const hasWardMap = allObs.length > 0 || allSen.length > 0;

  function Minimap({ wards, type }: { wards: { x: number; y: number; time: number; isRadiant: boolean }[]; type: 'Observer' | 'Sentry' }) {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6 }}>
          {type} Wards ({wards.length})
        </div>
        <div style={{ position: 'relative', width: 260, height: 260, background: '#0d1520', borderRadius: 6, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <Image
            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/map.png"
            alt="Dota 2 minimap" width={260} height={260} unoptimized
            style={{ opacity: 0.55, display: 'block' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {wards.map((w, i) => (
            <div key={i} title={`${type} @${timeStr(w.time)}`} style={{
              position: 'absolute',
              left:   `${coordToPercent(w.x)}%`,
              bottom: `${coordToPercent(w.y)}%`,
              width:  type === 'Observer' ? 9 : 7,
              height: type === 'Observer' ? 9 : 7,
              background: w.isRadiant ? '#4dba87' : '#e74c3c',
              borderRadius: type === 'Observer' ? '50%' : 2,
              border: '1.5px solid rgba(0,0,0,0.7)',
              transform: 'translate(-50%, 50%)',
              zIndex: 2,
            }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ward stats table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--color-border)' }}>
          Ward Stats
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dota-table">
            <thead>
              <tr>
                <th>Hero / Player</th>
                <th style={{ textAlign: 'center' }}>Team</th>
                <th style={{ textAlign: 'center' }}>Observers</th>
                <th style={{ textAlign: 'center' }}>Sentries</th>
                <th style={{ textAlign: 'center' }}>Camps Stacked</th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => {
                const isRad   = p.player_slot < 128;
                const color   = isRad ? 'var(--color-radiant)' : 'var(--color-dire)';
                const name    = p.name || p.personaname || (heroes?.[String(p.hero_id)]?.localized_name || `P${p.player_slot}`);
                return (
                  <tr key={p.player_slot}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <HeroIcon heroId={p.hero_id} heroes={heroes} size={36} />
                        <span style={{ fontSize: 12 }}>{name}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12, color }}>{isRad ? 'Radiant' : 'Dire'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#a3c4f3' }}>
                      {p.obs_placed ?? (p.obs_log?.length ?? '—')}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#ffd54f' }}>
                      {p.sen_placed ?? (p.sen_log?.length ?? '—')}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      {p.camps_stacked ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ward map */}
      {hasWardMap && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Ward Placement Map</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Minimap wards={allObs} type="Observer" />
            <Minimap wards={allSen} type="Sentry"   />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--color-muted)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-radiant)', marginRight: 4 }} />Radiant</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-dire)', marginRight: 4 }} />Dire</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Match header ────────────────────────────────────────────────────────────────

function MatchHeader({ match }: { match: MatchDetail }) {
  const seriesLabel = match.series_type === 1 ? 'Bo3' : match.series_type === 2 ? 'Bo5' : null;
  return (
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
            {match.patch && (
              <span style={{ fontSize: 11, background: 'rgba(77,186,135,0.1)', border: '1px solid rgba(77,186,135,0.2)', color: 'var(--color-muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                Patch {match.patch}
              </span>
            )}
            {seriesLabel && (
              <span style={{ fontSize: 11, background: 'rgba(201,162,39,0.1)', border: '1px solid rgba(201,162,39,0.2)', color: 'var(--color-gold)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                {seriesLabel}
              </span>
            )}
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
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────────

export default function MatchDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const matchId  = Number(params.id);
  const [tab, setTab] = useState<Tab>('overview');

  const { data: heroes } = useQuery({
    queryKey: ['hero-constants'],
    queryFn: async () => {
      const res = await fetch('https://api.opendota.com/api/constants/heroes');
      return res.json() as Promise<Record<string, { id: number; name: string; localized_name: string }>>;
    },
    staleTime: Infinity,
  });

  const { data: itemConstants } = useQuery({
    queryKey: ['item-constants'],
    queryFn: getItemConstants,
    staleTime: Infinity,
  });

  const { data: match, isLoading, error } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => getMatch(matchId),
  });

  const mlHeroIds = useMemo(() => {
    if (!match?.picks_bans?.length) return null;
    const radiant = match.picks_bans.filter((x) => x.is_pick && x.team === 0).map((x) => x.hero_id);
    const dire    = match.picks_bans.filter((x) => x.is_pick && x.team === 1).map((x) => x.hero_id);
    if (!radiant.length && !dire.length) return null;
    return { radiant, dire };
  }, [match]);

  const { data: mlData } = useQuery({
    queryKey: ['ml-predict-match', matchId],
    queryFn: async () => {
      const res = await fetch('/api/ml-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radiant_hero_ids: mlHeroIds!.radiant,
          dire_hero_ids:    mlHeroIds!.dire,
          radiant_team_id:  match?.radiant_team_id ?? null,
          dire_team_id:     match?.dire_team_id    ?? null,
        }),
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ radiant_win_prob: number; dire_win_prob: number; has_team_data: boolean; features_used: Record<string, number> }>;
    },
    enabled: !!mlHeroIds,
    retry: false,
    staleTime: Infinity,
  });

  const idMap = itemConstants ? buildItemIdMap(itemConstants) : {};

  if (isLoading) return <LoadingSpinner text="Loading match data..." />;
  if (error)     return <ErrorMessage message={(error as Error).message} />;
  if (!match)    return null;

  const radiantPlayers = match.players?.filter((p) => p.player_slot < 128)  || [];
  const direPlayers    = match.players?.filter((p) => p.player_slot >= 128) || [];
  const allPlayers     = [...radiantPlayers, ...direPlayers];
  const hasDraft       = (match.picks_bans?.length ?? 0) > 0;

  function analyzeDraft() {
    if (!match?.picks_bans?.length) return;
    const pb = match.picks_bans;
    function padTo<T>(arr: T[], len: number, fill: T): T[] {
      return [...arr.slice(0, len), ...Array(Math.max(0, len - arr.length)).fill(fill)];
    }
    localStorage.setItem('dota2stats_draft_import', JSON.stringify({
      radiant_picks: padTo(pb.filter((x) => x.is_pick && x.team === 0).map((x) => x.hero_id), 5, null),
      dire_picks:    padTo(pb.filter((x) => x.is_pick && x.team === 1).map((x) => x.hero_id), 5, null),
      radiant_bans:  padTo(pb.filter((x) => !x.is_pick && x.team === 0).map((x) => x.hero_id), 7, null),
      dire_bans:     padTo(pb.filter((x) => !x.is_pick && x.team === 1).map((x) => x.hero_id), 7, null),
      radiant_name:  match.radiant_name || '',
      dire_name:     match.dire_name    || '',
    }));
    router.push('/draft');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {match.leagueid ? (
          <Link href={`/tournaments/${match.leagueid}/matches`}
            style={{ fontSize: 12, color: 'var(--color-muted)', textDecoration: 'none' }}>
            ← Back to matches
          </Link>
        ) : <span />}
        {hasDraft && (
          <button onClick={analyzeDraft}
            style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(77,186,135,0.4)', background: 'rgba(77,186,135,0.1)', color: 'var(--color-radiant)', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', transition: 'background 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(77,186,135,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(77,186,135,0.1)'; }}>
            ⚔ Analyze Draft
          </button>
        )}
      </div>

      {/* Match header — always visible */}
      <MatchHeader match={match} />

      {/* Tab navigation */}
      <TabNav active={tab} onChange={setTab} />

      {/* Tab content */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {match.objectives && match.objectives.length > 0 && (
            <ObjectivesSection objectives={match.objectives} duration={match.duration} />
          )}
          <PlayerTable players={radiantPlayers} side="Radiant" won={match.radiant_win}    heroes={heroes} idMap={idMap} allPlayers={allPlayers} />
          <PlayerTable players={direPlayers}    side="Dire"    won={!match.radiant_win}   heroes={heroes} idMap={idMap} allPlayers={allPlayers} />
        </div>
      )}

      {tab === 'graphs'  && <GraphsTab  match={match} />}
      {tab === 'combat'  && <CombatTab  radiant={radiantPlayers} dire={direPlayers} heroes={heroes} />}
      {tab === 'farm'    && <FarmTab    radiant={radiantPlayers} dire={direPlayers} heroes={heroes} />}
      {tab === 'vision'  && <VisionTab  radiant={radiantPlayers} dire={direPlayers} heroes={heroes} />}

      {tab === 'drafts' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Draft Order</div>
          {hasDraft ? (
            <DraftSection picksBans={match.picks_bans} heroes={heroes} />
          ) : (
            <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: 0 }}>
              No draft data available for this match.
            </p>
          )}
        </div>
      )}

      {/* ML Pre-draft Prediction */}
      {mlData && (() => {
        const p = mlData.radiant_win_prob;
        const radiantFavored = p >= 0.5;
        const favProb = radiantFavored ? p : 1 - p;
        const favName = radiantFavored ? (match.radiant_name || 'Radiant') : (match.dire_name || 'Dire');
        const favColor = radiantFavored ? 'var(--color-radiant)' : 'var(--color-dire)';
        const breakEvenOdds = 1 / favProb;
        const ev185 = favProb * 1.85 - 1;
        const ev200 = favProb * 2.0 - 1;
        const kelly185 = ev185 > 0 ? (ev185 / 0.85) * 100 : 0;
        const SKIP_THRESHOLD = 0.54;
        const skip = favProb < SKIP_THRESHOLD;
        const correct = radiantFavored === match.radiant_win;
        const rad = Math.round(p * 100);
        const dir = Math.round((1 - p) * 100);

        const f = mlData.features_used;
        const reasons: string[] = [];
        const wradv = f['radiant_winrate_advantage'];
        if (wradv !== undefined && Math.abs(wradv) > 0.05) {
          if (wradv > 0) reasons.push(`Radiant better form: +${(wradv * 100).toFixed(0)}% winrate advantage`);
          else reasons.push(`Dire better form: +${(Math.abs(wradv) * 100).toFixed(0)}% winrate advantage`);
        }
        const radWR = f['radiant_recent_winrate'], direWR = f['dire_recent_winrate'];
        if (radWR !== undefined && radWR !== 0.5 && direWR !== undefined && direWR !== 0.5) {
          if (radiantFavored && radWR > 0.5) reasons.push(`Radiant on hot streak (${(radWR * 100).toFixed(0)}% recent WR)`);
          else if (!radiantFavored && direWR > 0.5) reasons.push(`Dire on hot streak (${(direWR * 100).toFixed(0)}% recent WR)`);
        }
        const radDispel = f['radiant_basic_dispel_count'] ?? 0;
        const dirDispel = f['dire_strong_dispel_count'] ?? 0;
        if (radDispel > 0 && radiantFavored) reasons.push(`Radiant draft has ${radDispel} dispel hero${radDispel > 1 ? 's' : ''} (key stat)`);
        if (dirDispel > 0 && !radiantFavored) reasons.push(`Dire draft has ${dirDispel} strong dispel hero${dirDispel > 1 ? 's' : ''}`);
        const radMeta = f['radiant_meta_score'] ?? 0.5, direMeta = f['dire_meta_score'] ?? 0.5;
        if (Math.abs(radMeta - direMeta) > 0.03) {
          if (radMeta > direMeta && radiantFavored) reasons.push(`Radiant heroes more meta (${(radMeta*100).toFixed(1)}% vs ${(direMeta*100).toFixed(1)}%)`);
          else if (direMeta > radMeta && !radiantFavored) reasons.push(`Dire heroes more meta (${(direMeta*100).toFixed(1)}% vs ${(radMeta*100).toFixed(1)}%)`);
        }
        const radSyn = f['radiant_synergy_score'] ?? 0, dirSyn = f['dire_synergy_score'] ?? 0;
        if (radSyn > dirSyn && radiantFavored) reasons.push(`Radiant draft has stronger synergies (${radSyn}/3)`);
        else if (dirSyn > radSyn && !radiantFavored) reasons.push(`Dire draft has stronger synergies (${dirSyn}/3)`);

        return (
          <div className="card" style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>ML Pre-draft Prediction</div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 400 }}>what the model predicted before this match</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: correct ? 'rgba(77,186,135,0.12)' : 'rgba(192,57,43,0.12)',
                  color: correct ? '#4dba87' : '#e74c3c',
                  border: `1px solid ${correct ? 'rgba(77,186,135,0.3)' : 'rgba(192,57,43,0.3)'}`,
                }}>
                  Model {correct ? 'correct' : 'wrong'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: match.radiant_win ? 'rgba(77,186,135,0.15)' : 'rgba(192,57,43,0.15)',
                  color: match.radiant_win ? 'var(--color-radiant)' : 'var(--color-dire)',
                  border: `1px solid ${match.radiant_win ? 'rgba(77,186,135,0.3)' : 'rgba(192,57,43,0.3)'}`,
                }}>
                  {match.radiant_win ? (match.radiant_name || 'Radiant') : (match.dire_name || 'Dire')} won
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Bar */}
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--color-radiant)', fontWeight: 800, fontSize: 22, minWidth: 52 }}>{rad}%</span>
                  <div style={{ flex: 1, height: 14, background: 'var(--color-border)', borderRadius: 7, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p * 100}%`, background: 'linear-gradient(90deg, var(--color-radiant), #3aa870)', borderRadius: '7px 0 0 7px' }} />
                  </div>
                  <span style={{ color: 'var(--color-dire)', fontWeight: 800, fontSize: 22, minWidth: 52, textAlign: 'right' }}>{dir}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)' }}>
                  <span style={{ color: 'var(--color-radiant)', fontWeight: 600 }}>{match.radiant_name || 'RADIANT'}</span>
                  <span>{rad === dir ? 'Even' : rad > dir ? `Radiant favored +${rad - dir}%` : `Dire favored +${dir - rad}%`}</span>
                  <span style={{ color: 'var(--color-dire)', fontWeight: 600 }}>{match.dire_name || 'DIRE'}</span>
                </div>
              </div>

              {/* Bet recommendation */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 12 }}>
                  Betting Recommendation
                </div>
                {skip ? (
                  <div style={{ padding: '14px 16px', background: 'rgba(26,39,64,0.7)', borderRadius: 8, border: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-muted)', marginBottom: 4 }}>SKIP THIS BET</div>
                    <div style={{ fontSize: 12, color: 'var(--color-dim)' }}>Model confidence {Math.round(favProb * 100)}% — too close to 50/50 for positive EV at standard odds</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180, padding: '14px 16px', background: `rgba(${radiantFavored ? '77,186,135' : '192,57,43'},0.1)`, borderRadius: 8, border: `1px solid ${radiantFavored ? 'rgba(77,186,135,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Bet on</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: favColor, marginBottom: 4 }}>{favName}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Model prob: <strong style={{ color: favColor }}>{Math.round(favProb * 100)}%</strong></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 180, padding: '14px 16px', background: 'rgba(26,39,64,0.5)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Expected Value</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--color-muted)' }}>At 1.85 odds:</span>
                          <span style={{ fontWeight: 700, color: ev185 > 0 ? '#4dba87' : '#e74c3c' }}>{ev185 > 0 ? '+' : ''}{(ev185 * 100).toFixed(1)}% EV</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--color-muted)' }}>At 2.00 odds:</span>
                          <span style={{ fontWeight: 700, color: ev200 > 0 ? '#4dba87' : '#e74c3c' }}>{ev200 > 0 ? '+' : ''}{(ev200 * 100).toFixed(1)}% EV</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <span style={{ color: 'var(--color-muted)' }}>Min odds for +EV:</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-gold)' }}>{breakEvenOdds.toFixed(2)}</span>
                        </div>
                        {kelly185 > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: 'var(--color-muted)' }}>Kelly @ 1.85:</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-gold)' }}>{kelly185.toFixed(1)}% bankroll</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {reasons.slice(0, 4).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Why</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {reasons.slice(0, 4).map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--color-text)' }}>
                          <span style={{ color: favColor, fontWeight: 700, marginTop: 1 }}>›</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ fontSize: 11, color: 'var(--color-dim)', padding: '8px 10px', background: 'rgba(26,39,64,0.5)', borderRadius: 5, borderLeft: '2px solid var(--color-border)' }}>
                {mlData.has_team_data ? 'Team winrate data from local DB included.' : 'Teams not in local DB — winrate features use defaults.'}
                {' Model accuracy: ~58.5% on test data. Bet responsibly.'}
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ fontSize: 11, color: 'var(--color-dim)', textAlign: 'right' }}>
        Match #{match.match_id}
        {match.leagueid && (
          <> · <Link href={`/tournaments/${match.leagueid}`} style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>
            League #{match.leagueid}
          </Link></>
        )}
      </div>
    </div>
  );
}
