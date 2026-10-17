// Lager en statisk versjon av siden i dist/ (for Vercel): public/ + ferdig utregnet statistikk per periode.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { PLAYERS, DATA_FILE } from '../src/config.js';
import { loadStore } from '../src/store.js';
import { computeStats } from '../src/stats.js';
import { matchDetail } from '../src/extras.js';
import { PERIODS, periodStart } from '../src/periods.js';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname;

const store = await loadStore(DATA_FILE);
await rm(DIST, { recursive: true, force: true });
await cp(PUBLIC_DIR, DIST, { recursive: true });
await cp(new URL('../src/periods.js', import.meta.url), `${DIST}periods.js`);
await mkdir(`${DIST}api`, { recursive: true });
// Periodene regnes fra byggetidspunktet; siden bygges på nytt hver gang det kommer nye kamper
const now = Date.now();
for (const { key } of PERIODS) {
  const stats = computeStats(store, PLAYERS, { since: periodStart(key, now), now });
  await writeFile(`${DIST}api/stats-${key}.json`, JSON.stringify(stats));
  if (key === 'all') {
    await writeFile(`${DIST}api/stats.json`, JSON.stringify(stats));
    console.log(`Bygget dist/ med ${stats.totalMatches} kamper`);
  }
}

// Én fil per kamp til kampsiden
await mkdir(`${DIST}api/match`, { recursive: true });
const ids = Object.keys(store.matches);
for (const id of ids) await writeFile(`${DIST}api/match/${id}.json`, JSON.stringify(matchDetail(store, PLAYERS, id)));
console.log(`Bygget ${ids.length} kampsider`);
