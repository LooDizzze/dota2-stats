import { NextRequest, NextResponse } from 'next/server';

// Proxy to Liquipedia API — needed to add proper User-Agent and avoid CORS
export async function GET(request: NextRequest) {
  const team = request.nextUrl.searchParams.get('team');
  if (!team) return NextResponse.json({ players: [], error: 'Missing team param' }, { status: 400 });

  // Try exact name first, then common transformations
  const attempts = [
    team.trim(),
    team.trim().replace(/\s+/g, '_'),
  ];

  for (const pageName of attempts) {
    const url =
      `https://liquipedia.net/dota2/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=wikitext&format=json&formatversion=2`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Dota2StatsTool/1.0 (personal betting research project)',
          'Accept-Encoding': 'gzip',
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (data.error) continue;

      const wikitext: string = data.parse?.wikitext || '';
      if (!wikitext) continue;

      const players = parseRoster(wikitext);
      if (players.length === 0) continue;

      return NextResponse.json(
        { players, pageName },
        { headers: { 'Cache-Control': 'public, max-age=3600' } }
      );
    } catch {
      continue;
    }
  }

  return NextResponse.json({ players: [], error: 'Not found on Liquipedia' });
}

// Extract active roster from Liquipedia wikitext
function parseRoster(wikitext: string): string[] {
  const players: string[] = [];
  const seen = new Set<string>();

  // Match |p1=Name, |p2=Name, ... (pN= only — not p1flag=, p1pos=, p1link= etc.)
  const regex = /\|p(\d+)=([^|\n{}<>[\]]+)/g;
  let match;
  while ((match = regex.exec(wikitext)) !== null) {
    const raw = match[2].trim();
    if (!raw) continue;
    // Skip placeholders and template keywords
    if (/^(TBD|TBA|empty|--)$/i.test(raw)) continue;
    // Skip if it looks like a template call or contains special chars
    if (raw.includes('{{') || raw.includes('<!--')) continue;
    // Remove any trailing wiki markup
    const name = raw.replace(/\s*<!--.*-->/, '').trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      players.push(name);
    }
  }

  return players;
}
