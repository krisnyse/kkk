// Midlertidig: skriv ut rådata for kveldens kamper for å finne riktig map-felt.
import zlib from 'node:zlib';
import { PLAYERS } from '../src/config.js';
import { allProfileIds } from '../src/accounts.js';
import { getRecentMatches } from '../src/relic.js';

const IDS = [517037854, 517030536, 517029858, 514528555, 514529078];
const h = await getRecentMatches(allProfileIds(PLAYERS));
for (const m of h.matchHistoryStats ?? []) {
  if (!IDS.includes(m.id)) continue;
  const { matchhistorymember, matchhistoryreportresults, matchurls, ...rest } = m;
  console.log('=== RELIC', m.id, JSON.stringify(rest));
  for (const f of ['options', 'slotinfo']) {
    try {
      const buf = zlib.inflateSync(Buffer.from(m[f], 'base64'));
      console.log(f, 'inflated hex:', buf.subarray(0, 64).toString('hex'));
      console.log(f, 'inflated latin1:', JSON.stringify(buf.toString('latin1').slice(0, 3000)));
    } catch (e) { console.log(f, 'inflate failed', e.message); }
  }
}
const res = await fetch(`https://data.aoe2companion.com/api/matches?profile_ids=${PLAYERS[0].profileId}&page=1&per_page=10`, { headers: { 'User-Agent': 'kkk-dashboard (debug)' } });
const c = await res.json();
for (const m of c.matches ?? []) {
  const { teams, ...rest } = m;
  console.log('=== COMPANION', JSON.stringify(rest));
}
