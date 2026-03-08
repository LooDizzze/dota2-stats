import { NextResponse } from 'next/server';

const LP_HEADERS = {
  'User-Agent': 'Dota2StatsTool/1.0 (personal betting research project)',
  'Accept-Encoding': 'gzip',
};

const LP_API = 'https://liquipedia.net/dota2/api.php';

async function lpFetch(params: Record<string, string>) {
  const url = new URL(LP_API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2' })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: LP_HEADERS });
  if (!res.ok) throw new Error(`Liquipedia API error: ${res.status}`);
  return res.json();
}

function getField(wikitext: string, key: string): string | null {
  const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|\\n}]+)`));
  return m ? m[1].trim() : null;
}

function parseDate(s: string | null): number | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

export interface LPTournament {
  title: string;
  name: string;
  shortname: string | null;
  sdate: number | null;
  edate: number | null;
  prizepoolusd: string | null;
  liquipediaUrl: string;
}

export async function GET() {
  try {
    // 1. Fetch S-Tier category members (most recent first)
    const catResult = await lpFetch({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:S-Tier_Tournaments',
      cmlimit: '50',
      cmsort: 'timestamp',
      cmdir: 'desc',
    });

    const allTitles: string[] = (catResult.query?.categorymembers || [])
      .map((m: { title: string }) => m.title)
      .filter((t: string) => /202[456]/.test(t));

    if (allTitles.length === 0) return NextResponse.json({ tournaments: [] });

    // 2. Batch fetch wikitext for up to 25 pages in one request
    const titles = allTitles.slice(0, 25).join('|');
    const wikiResult = await lpFetch({
      action: 'query',
      titles,
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
    });

    // 3. Parse infoboxes
    const tournaments: LPTournament[] = [];
    const pages = Object.values(wikiResult.query?.pages || {}) as Record<string, unknown>[];

    for (const page of pages) {
      const p = page as {
        missing?: boolean;
        title: string;
        revisions?: { slots?: { main?: { content?: string } } }[];
      };
      if (p.missing) continue;

      const wikitext = p.revisions?.[0]?.slots?.main?.content || '';
      if (!wikitext) continue;

      const name = getField(wikitext, 'name') || p.title;
      const shortname = getField(wikitext, 'shortname');
      const sdate = parseDate(getField(wikitext, 'sdate'));
      const edate = parseDate(getField(wikitext, 'edate'));
      const prizepoolusd = getField(wikitext, 'prizepoolusd');

      tournaments.push({
        title: p.title,
        name,
        shortname,
        sdate,
        edate,
        prizepoolusd,
        liquipediaUrl: `https://liquipedia.net/dota2/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      });
    }

    // Sort by sdate descending (newest first)
    tournaments.sort((a, b) => (b.sdate || 0) - (a.sdate || 0));

    return NextResponse.json(
      { tournaments },
      { headers: { 'Cache-Control': 'public, max-age=1800' } }
    );
  } catch (e) {
    return NextResponse.json({ tournaments: [], error: String(e) }, { status: 500 });
  }
}
