'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getTeamLogoUrl } from '@/lib/opendota';

interface TeamLogoProps {
  teamId: number;
  teamName: string;
  size?: number;
}

export default function TeamLogo({ teamId, teamName, size = 32 }: TeamLogoProps) {
  const [error, setError] = useState(false);

  const initials = (teamName || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);

  if (error || !teamId) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: 'var(--color-border)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(9, Math.round(size * 0.33)),
          fontWeight: 700,
          color: 'var(--color-muted)',
          flexShrink: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {initials || '?'}
      </div>
    );
  }

  return (
    <Image
      src={getTeamLogoUrl(teamId)}
      alt={teamName}
      width={size}
      height={size}
      style={{ borderRadius: '4px', objectFit: 'contain', flexShrink: 0 }}
      onError={() => setError(true)}
    />
  );
}
