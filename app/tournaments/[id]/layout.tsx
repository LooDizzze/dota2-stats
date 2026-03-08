'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getLeague } from '@/lib/opendota';

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = Number(params.id);

  const { data: league } = useQuery({
    queryKey: ['league', id],
    queryFn: () => getLeague(id),
  });

  const tabs = [
    { label: 'Overview', href: `/tournaments/${id}` },
    { label: 'Matches', href: `/tournaments/${id}/matches` },
    { label: 'Heroes', href: `/tournaments/${id}/heroes` },
    { label: 'Teams', href: `/tournaments/${id}/teams` },
  ];

  return (
    <div>
      {/* Tournament header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          href="/"
          style={{
            fontSize: '12px',
            color: 'var(--color-muted)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '12px',
          }}
        >
          ← Tournaments
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {league?.tier === 'premium' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--color-gold)',
                    background: 'rgba(201, 162, 39, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Tier 1
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
              {league?.name || `Tournament #${id}`}
            </h1>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '24px',
          gap: '4px',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.href === `/tournaments/${id}` ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-gold-bright)' : 'var(--color-muted)',
                borderBottom: isActive ? '2px solid var(--color-gold)' : '2px solid transparent',
                textDecoration: 'none',
                marginBottom: '-1px',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
