'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        backgroundColor: 'var(--color-card)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          height: '56px',
          gap: '32px',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, var(--color-red) 0%, var(--color-gold) 100%)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '16px',
              color: '#fff',
            }}
          >
            D
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '16px',
              color: 'var(--color-gold-bright)',
              letterSpacing: '0.02em',
            }}
          >
            Dota2Stats
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          <NavLink href="/" active={pathname === '/'}>
            Tournaments
          </NavLink>
          <NavLink href="/teams" active={pathname.startsWith('/teams')}>
            Teams
          </NavLink>
          <NavLink href="/draft" active={pathname.startsWith('/draft')} highlight>
            Draft Analyzer
          </NavLink>
        </div>

        {/* Right side info */}
        <div style={{ fontSize: '11px', color: 'var(--color-muted)', flexShrink: 0 }}>
          Data: OpenDota API
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
  highlight,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: active ? 600 : highlight ? 500 : 400,
        color: active ? 'var(--color-gold-bright)' : highlight ? 'var(--color-text)' : 'var(--color-muted)',
        background: active ? 'rgba(201, 162, 39, 0.1)' : highlight && !active ? 'rgba(77, 186, 135, 0.08)' : 'transparent',
        border: highlight && !active ? '1px solid rgba(77,186,135,0.25)' : '1px solid transparent',
        textDecoration: 'none',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </Link>
  );
}
