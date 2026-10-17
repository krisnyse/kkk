// Klient for Relic/World's Edge sitt community-API (det spillet selv bruker).
// Uoffisielt og udokumentert: ingen nøkkel, men vær snill med antall kall.
const BASE = 'https://aoe-api.worldsedgelink.com/community/leaderboard';

async function call(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('title', 'age2');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': 'kkk-dashboard' } });
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.result?.code !== 0) throw new Error(`${endpoint}: ${body.result?.message ?? 'ukjent feil'}`);
  return body;
}

// Navn, land og rating på alle ladder-ene for hver spiller.
export function getPersonalStats(profileIds) {
  return call('GetPersonalStat', { profile_ids: JSON.stringify(profileIds) });
}

// De siste kampene (ca. 10 per kamptype) for spillerne.
export function getRecentMatches(profileIds) {
  return call('getRecentMatchHistory', { profile_ids: JSON.stringify(profileIds) });
}
