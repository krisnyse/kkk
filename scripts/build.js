// Lager en statisk versjon av siden i dist/ (for Vercel): public/ + ferdig utregnet api/stats.json.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { PLAYERS, DATA_FILE } from '../src/config.js';
import { loadStore } from '../src/store.js';
import { computeStats } from '../src/stats.js';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname;

const stats = computeStats(await loadStore(DATA_FILE), PLAYERS);
await rm(DIST, { recursive: true, force: true });
await cp(PUBLIC_DIR, DIST, { recursive: true });
await mkdir(`${DIST}api`, { recursive: true });
await writeFile(`${DIST}api/stats.json`, JSON.stringify(stats));
console.log(`Bygget dist/ med ${stats.totalMatches} kamper`);
