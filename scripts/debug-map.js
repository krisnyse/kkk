// Midlertidig: sammenlign Relics mapname og options med kartet aoe2companion oppgir.
import zlib from 'node:zlib';
import { PLAYERS } from '../src/config.js';
import { allProfileIds } from '../src/accounts.js';
import { getRecentMatches } from '../src/relic.js';

function options(b64) {
  const inner = Buffer.from(JSON.parse(zlib.inflateSync(Buffer.from(b64, 'base64')).toString()), 'base64');
  const kv = {};
  for (let p = 1; p < inner.length;) {
    const len = inner.readUInt32LE(p);
    const [k, ...v] = inner.subarray(p + 4, p + 4 + len).toString().split(':');
    kv[k] = v.join(':');
    p += 4 + len;
  }
  return kv;
}

const companion = new Map();
for (const pl of PLAYERS) {
  const res = await fetch(`https://data.aoe2companion.com/api/matches?profile_ids=${pl.profileId}&page=1&per_page=100`, { headers: { 'User-Agent': 'kkk-dashboard (debug)' } });
  for (const m of (await res.json()).matches ?? []) companion.set(m.matchId, `${m.map}|${m.mapName}`);
}
const seen = new Set();
const h = await getRecentMatches(allProfileIds(PLAYERS));
for (const m of h.matchHistoryStats ?? []) {
  if (seen.has(m.id)) continue;
  seen.add(m.id);
  const o = options(m.options);
  console.log('ROW', m.id, m.matchtype_id, m.mapname, 'opt10=' + o['10'], 'opt5=' + o['5'], 'opt52=' + o['52'], 'companion=' + companion.get(m.id));
}
