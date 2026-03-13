'use client';

import Image from 'next/image';
import { getHeroImageUrl, getHeroPortraitUrl } from '@/lib/opendota';
import { HeroConstants } from '@/lib/types';

interface HeroImageProps {
  heroId: number;
  heroes: HeroConstants;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'portrait';
}

const SIZES = {
  sm: { width: 40, height: 22 },
  md: { width: 60, height: 34 },
  lg: { width: 86, height: 48 },
};

export default function HeroImage({
  heroId,
  heroes,
  size = 'md',
  variant = 'icon',
}: HeroImageProps) {
  const hero = heroes[heroId];
  if (!hero) return <div style={{ width: SIZES[size].width, height: SIZES[size].height, background: 'var(--color-border)', borderRadius: 4 }} />;

  const src =
    variant === 'portrait'
      ? getHeroPortraitUrl(hero.name)
      : getHeroImageUrl(hero.name);

  const { width, height } = SIZES[size];

  return (
    <Image
      src={src}
      alt={hero.localized_name}
      width={width}
      height={height}
      unoptimized
      style={{ borderRadius: 4, objectFit: 'cover' }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
