'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [editInput, setEditInput] = useState('');

  useEffect(() => {
    try { setBankroll(parseFloat(localStorage.getItem('bets:bankroll') || '100') || 100); } catch {}
    const sync = () => {
      try { setBankroll(parseFloat(localStorage.getItem('bets:bankroll') || '100') || 100); } catch {}
    };
    window.addEventListener('bankroll-updated', sync);
    return () => window.removeEventListener('bankroll-updated', sync);
  }, []);

  function saveBankroll(v: number) {
    setBankroll(v);
    try {
      localStorage.setItem('bets:bankroll', String(v));
      window.dispatchEvent(new Event('bankroll-updated'));
    } catch {}
  }

  function handleAdd() {
    const v = parseFloat(addInput);
    if (!v || v <= 0) { setAdding(false); return; }
    saveBankroll((bankroll || 0) + v);
    setAddInput('');
    setAdding(false);
  }

  function handleEdit() {
    const v = parseFloat(editInput);
    if (!v || v <= 0) { setEditing(false); return; }
    saveBankroll(v);
    setEditInput('');
    setEditing(false);
  }

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
          <NavLink href="/bets" active={pathname.startsWith('/bets')}>
            Bet History
          </NavLink>
        </div>

        {/* Bankroll */}
        {bankroll !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {adding ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  autoFocus
                  type="number" min="1" step="1" placeholder="+ amount"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                  style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, outline: 'none' }}
                />
                <button onClick={handleAdd} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--color-radiant)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>OK</button>
                <button onClick={() => setAdding(false)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-muted)', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
            ) : (
              <>
                {editing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      autoFocus
                      type="number" min="1" step="1" placeholder="set balance"
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditing(false); }}
                      style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-radiant)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, outline: 'none' }}
                    />
                    <button onClick={handleEdit} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--color-radiant)', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>OK</button>
                    <button onClick={() => setEditing(false)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'none', color: 'var(--color-muted)', fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <div
                    onClick={() => { setEditInput(String(bankroll)); setEditing(true); setAdding(false); }}
                    title="Click to set balance"
                    style={{ textAlign: 'right', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1 }}>Bankroll</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-radiant)', lineHeight: 1.3 }}>${bankroll.toFixed(2)}</div>
                  </div>
                )}
                {!editing && (
                  <button
                    onClick={() => { setAdding(true); setEditing(false); }}
                    title="Add funds"
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--color-border)', background: 'var(--color-card)', color: 'var(--color-muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >+</button>
                )}
              </>
            )}
          </div>
        )}
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
