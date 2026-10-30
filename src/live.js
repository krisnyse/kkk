// «Spiller nå»: kamper som pågår akkurat nå for noen av oss.
// Relic-API-et viser bare ferdige kamper, så vi spør aoe2companion (uoffisielt), som også har pågående kamper.
// Brukes både av Vercel-funksjonen (api/live.js) og den lokale serveren.
import { allProfileIds } from './accounts.js';

const URL_BASE = 'https://data.aoe2companion.com/api/matches';
const MAX_AGE_S = 3 * 3600; // eldre «pågående» kamper har nok bare mistet slutten sin

// Pågående kamper med minst én av oss, nyeste først
export function liveMatches(matches, players, now = Date.now()) {
  const owner = new Map(players.flatMap((p) => [p.profileId, ...(p.otherAccounts ?? [])].map((id) => [id, p])));
  const nowS = Math.floor(now / 1000);
  const seen = new Set();
  return (matches ?? [])
    .filter((m) => !m.finished && m.started)
    .map((m) => ({ ...m, startS: Math.floor(Date.parse(m.started) / 1000) }))
    .filter((m) => nowS - m.startS >= 0 && nowS - m.startS < MAX_AGE_S)
    .filter((m) => !seen.has(m.matchId) && seen.add(m.matchId))
    .sort((a, b) => b.startS - a.startS)
    .map((m) => {
      const teams = (m.teams ?? []).map((t) => (t.players ?? []).map((p) => {
        const clan = owner.get(p.profileId);
        return { profileId: clan?.profileId ?? p.profileId, name: clan?.name ?? p.name ?? '?', clan: Boolean(clan), civ: p.civName ?? null, rating: p.rating ?? null };
      }));
      const ours = teams.findIndex((t) => t.some((p) => p.clan));
      return {
        id: m.matchId,
        map: m.mapName ?? null,
        type: m.leaderboardName ?? (m.leaderboardId ? String(m.leaderboardId) : null),
        started: m.startS,
        ours: teams[ours] ?? [],
        theirs: teams.filter((_, i) => i !== ours).flat(),
      };
    })
    .filter((m) => m.ours.length);
}

export async function fetchLive(players, now = Date.now()) {
  const url = `${URL_BASE}?profile_ids=${allProfileIds(players).join(',')}&per_page=20`;
  // Uten egen User-Agent svarer API-et 403
  const res = await fetch(url, { headers: { 'User-Agent': 'kkk-dashboard (spiller nå)' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`aoe2companion: HTTP ${res.status}`);
  return { checkedAt: new Date(now).toISOString(), matches: liveMatches((await res.json()).matches, players, now) };
}

// Lokalt: maks ett kall i minuttet. På Vercel tar CDN-cachen seg av det.
let cached = null;
export async function cachedLive(players, now = Date.now()) {
  if (cached && now - cached.at < 60_000) return cached.body;
  const body = await fetchLive(players, now);
  cached = { at: now, body };
  return body;
}
