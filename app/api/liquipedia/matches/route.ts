import { NextRequest, NextResponse } from 'next/server';

const LP_HEADERS = {
  'User-Agent': 'Dota2StatsTool/1.0 (personal project; contact: https://github.com/LooDizzze/dota2-stats)',
  'Accept-Encoding': 'gzip',
};

const LP_API = 'https://liquipedia.net/dota2/api.php';

// Timezone offset map for {{Abbr/TZ}} patterns
const TZ_OFFSETS: Record<string, number> = {
  EET: 2, EEST: 3, CET: 1, CEST: 2,
  UTC: 0, GMT: 0,
  PST: -8, PDT: -7, EST: -5, EDT: -4,
  MSK: 3, IST: 5.5, JST: 9, KST: 9, CST: 8,
  AEST: 10, AEDT: 11, SGT: 8,
};

async function lpFetch(params: Record<string, string>) {
  const url = new URL(LP_API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2' })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: LP_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`LP API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

// Parse "March 9, 2026 - 16:00 {{Abbr/EET}}" → Unix timestamp (UTC)
function parseMatchDate(raw: string): number | null {
  // Extract timezone from {{Abbr/TZ}} or plain TZ at end
  const tzMatch = raw.match(/\{\{Abbr\/([A-Z]+)\}\}/) || raw.match(/\b([A-Z]{2,5})\b\s*$/);
  const tzAbbr = tzMatch ? tzMatch[1] : 'UTC';
  const tzOffset = TZ_OFFSETS[tzAbbr] ?? 0;

  // Remove all template markup and clean
  let clean = raw
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s*-\s*/, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Try "Month Day, Year HH:MM" → parse as UTC then shift by tz
  const m = clean.match(/^([A-Za-z]+ \d+,?\s*\d{4})\s+(\d{1,2}:\d{2})$/);
  if (m) {
    const d = new Date(`${m[1].replace(',', '')} ${m[2]}:00 UTC`);
    if (!isNaN(d.getTime())) {
      // Subtract tzOffset because the time was given in local tz, not UTC
      // e.g. 16:00 EET (UTC+2) = 14:00 UTC → 16:00 UTC - 2h = 14:00 UTC ✓
      return Math.floor(d.getTime() / 1000) - tzOffset * 3600;
    }
  }

  // Fallback: try parsing as-is
  const d2 = new Date(clean);
  if (!isNaN(d2.getTime())) {
    return Math.floor(d2.getTime() / 1000) - tzOffset * 3600;
  }

  return null;
}

export interface UpcomingMatch {
  timestamp: number;
  team1: string;
  team2: string;
  bestof: number;
  tournament: string;
}

function parseMatchesFromWikitext(wikitext: string, tournamentName: string, now: number): UpcomingMatch[] {
  const matches: UpcomingMatch[] = [];
  const parts = wikitext.split(/\{\{Match\b/);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    // Find end of match block (handles nested templates)
    const endIdx = block.indexOf('\n}}');
    const content = endIdx > 0 ? block.substring(0, endIdx) : block.substring(0, 2000);

    // Extract team names — try both TeamOpponent and SoloOpponent
    const oppMatches = [
      ...content.matchAll(/\|opponent\d[^=]*=\{\{(?:[Tt]eam|[Ss]olo)[Oo]pponent\|([^|}\n]+)/g),
    ];
    const teams = oppMatches.map((m) => m[1].trim()).filter(Boolean);
    if (teams.length < 2) continue;

    const dateMatch = content.match(/\|date=([^\n|]+)/);
    if (!dateMatch) continue;

    const raw = dateMatch[1].trim();
    if (!raw || raw === 'TBD' || raw.toLowerCase().includes('tbd')) continue;

    const timestamp = parseMatchDate(raw);
    if (!timestamp || timestamp <= now) continue;

    const bestofMatch = content.match(/\|bestof=(\d+)/);

    matches.push({
      timestamp,
      team1: teams[0],
      team2: teams[1],
      bestof: bestofMatch ? parseInt(bestofMatch[1]) : 3,
      tournament: tournamentName,
    });
  }

  return matches;
}

// Search LP for tournament pages matching a query
async function searchLP(query: string): Promise<string | null> {
  const data = await lpFetch({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '10',
    srnamespace: '0',
  });
  const results: { title: string }[] = data.query?.search || [];
  // Tournament pages: 1-2 slashes ("Org/Name" or "Org/Name/Season")
  for (const r of results) {
    const slashes = (r.title.match(/\//g) || []).length;
    if (slashes >= 1 && slashes <= 2) return r.title;
  }
  return null;
}

// Find tournament main page title — tries multiple query variations
async function findTournamentPage(name: string): Promise<string | null> {
  // Try original name first
  const r1 = await searchLP(name);
  if (r1) return r1;

  // Strip 4-digit years and retry (e.g. "PGL Wallachia 2026 Season 7" → "PGL Wallachia Season 7")
  const stripped = name.replace(/\b(20\d{2})\b\s*/g, '').trim();
  if (stripped !== name) {
    const r2 = await searchLP(stripped);
    if (r2) return r2;
  }

  // Try just the first 3 significant words
  const words = name.replace(/\b(20\d{2})\b/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    const r3 = await searchLP(words.slice(0, 3).join(' '));
    if (r3) return r3;
  }

  return null;
}

// Discover all subpages of a tournament page via allpages API
async function getSubpages(pageTitle: string): Promise<string[]> {
  const data = await lpFetch({
    action: 'query',
    list: 'allpages',
    apprefix: `${pageTitle}/`,
    aplimit: '20',
    apnamespace: '0',
  });
  const pages: { title: string }[] = data.query?.allpages || [];
  // Only include direct children (one more slash level)
  const depth = (pageTitle.match(/\//g) || []).length + 1;
  return pages
    .filter((p) => (p.title.match(/\//g) || []).length === depth)
    .map((p) => p.title);
}

// Fetch wikitext for multiple pages in one request (up to 50 titles)
async function fetchWikitexts(titles: string[]): Promise<{ title: string; wikitext: string }[]> {
  if (titles.length === 0) return [];
  const data = await lpFetch({
    action: 'query',
    titles: titles.join('|'),
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
  });
  const pages = Object.values(data.query?.pages || {}) as Record<string, unknown>[];
  return pages
    .map((page) => {
      const p = page as { missing?: boolean; title: string; revisions?: { slots?: { main?: { content?: string } } }[] };
      if (p.missing) return null;
      const wikitext = p.revisions?.[0]?.slots?.main?.content || '';
      return { title: p.title, wikitext };
    })
    .filter(Boolean) as { title: string; wikitext: string }[];
}

export async function GET(request: NextRequest) {
  const namesParam = request.nextUrl.searchParams.get('names');
  if (!namesParam) return NextResponse.json({ matches: [] });

  const now = Math.floor(Date.now() / 1000);
  const tournamentNames = namesParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);

  const debugInfo: string[] = [];

  try {
    const allMatches: UpcomingMatch[] = [];

    for (const name of tournamentNames) {
      // Step 1: Find the main tournament page
      const pageTitle = await findTournamentPage(name);
      if (!pageTitle) {
        debugInfo.push(`No LP page found for: ${name}`);
        continue;
      }
      debugInfo.push(`Found: ${pageTitle} for "${name}"`);

      // Step 2: Discover subpages
      const subpages = await getSubpages(pageTitle);
      debugInfo.push(`Subpages: ${subpages.join(', ') || '(none)'}`);

      // Step 3: Fetch all pages (main + subpages)
      const allTitles = [pageTitle, ...subpages].slice(0, 15);
      const pages = await fetchWikitexts(allTitles);

      // Step 4: Parse matches from each page
      for (const { title, wikitext } of pages) {
        const parsed = parseMatchesFromWikitext(wikitext, name, now);
        debugInfo.push(`${title}: ${parsed.length} future matches`);
        allMatches.push(...parsed);
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const unique = allMatches
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((m) => {
        const key = `${m.team1}|${m.team2}|${m.timestamp}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return NextResponse.json(
      { matches: unique.slice(0, 20), debug: debugInfo },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    );
  } catch (e) {
    return NextResponse.json({ matches: [], error: String(e), debug: debugInfo }, { status: 500 });
  }
}
