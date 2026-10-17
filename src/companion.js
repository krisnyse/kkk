// Henter eldre kamphistorikk fra aoe2companion (uoffisielt API). Brukes bare til engangsimport;
// den løpende hentingen går mot Relic-API-et i relic.js.
import { CIVS } from './civs.js';

const BASE = 'https://data.aoe2companion.com/api';
const PER_PAGE = 300;
const civIdByName = new Map(Object.entries(CIVS).map(([id, name]) => [name.toLowerCase(), Number(id)]));
civIdByName.set('mayans', civIdByName.get('maya'));
civIdByName.set('indians', civIdByName.get('hindustanis'));
civIdByName.set('inca', civIdByName.get('incas'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(profileId, page) {
  const url = `${BASE}/matches?profile_ids=${profileId}&page=${page}&per_page=${PER_PAGE}`;
  for (let attempt = 1; ; attempt++) {
    // Uten egen User-Agent svarer API-et 403 etter første kall
    const res = await fetch(url, { headers: { 'User-Agent': 'kkk-dashboard (engangsimport)' } });
    if (res.ok) return (await res.json()).matches ?? [];
    if (attempt >= 3 || (res.status !== 429 && res.status < 500)) throw new Error(`${url}: HTTP ${res.status}`);
    await sleep(Number(res.headers.get('retry-after') ?? 10) * 1000);
  }
}

// Alle kampene til én spiller, nyeste først. Ca. 1 kall i sekundet for å være snill.
export async function fetchAllMatches(profileId, log = () => {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const matches = await getPage(profileId, page);
    if (!matches.length) break;
    all.push(...matches);
    log(`  side ${page}: ${matches.length} kamper (eldste ${matches.at(-1).started?.slice(0, 10)})`);
    await sleep(1000);
  }
  return all;
}

// Relic sine matchtype_id, så kamper fra begge kilder grupperes likt
function matchType(m, perTeam) {
  if (m.leaderboardId === 'rm_1v1') return 6;
  if (m.leaderboardId === 'rm_team') return { 2: 7, 3: 8, 4: 9 }[perTeam] ?? null;
  if (m.leaderboardId === 'unranked' || m.leaderboardId == null) return 0;
  return null;
}

const toUnix = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);

// ratingIsBefore: om aoe2companion sin `rating` er ratingen før kampen (avgjøres mot Relic-data i importskriptet)
export function normalizeCompanionMatch(m, { ratingIsBefore }) {
  const teams = m.teams ?? [];
  const perTeam = Math.max(...teams.map((t) => t.players?.length ?? 0), 0);
  const players = teams.flatMap((t) => (t.players ?? []).map((p) => {
    const civId = civIdByName.get(String(p.civName ?? '').toLowerCase()) ?? null;
    const hasRating = p.rating != null && p.ratingDiff != null;
    return {
      profileId: p.profileId,
      civId,
      ...(civId == null && p.civName ? { civName: p.civName } : {}),
      team: p.team ?? t.teamId,
      won: p.won === true,
      oldRating: hasRating ? (ratingIsBefore ? p.rating : p.rating - p.ratingDiff) : null,
      newRating: hasRating ? (ratingIsBefore ? p.rating + p.ratingDiff : p.rating) : (p.rating ?? null),
    };
  }));
  const type = matchType(m, perTeam);
  return {
    id: m.matchId,
    mapFile: m.mapName ?? m.map ?? '',
    matchType: type,
    ...(type == null && m.leaderboardName ? { typeName: m.leaderboardName } : {}),
    start: toUnix(m.started),
    end: toUnix(m.finished),
    players,
    source: 'aoe2companion',
  };
}
