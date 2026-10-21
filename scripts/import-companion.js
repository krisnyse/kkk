// Engangsimport av eldre kamper fra aoe2companion inn i data/matches.json.
// Kamper som allerede finnes (fra Relic-API-et) beholdes som de er.
//   node scripts/import-companion.js [--dry-run]
import { PLAYERS, DATA_FILE } from '../src/config.js';
import { loadStore, saveStore } from '../src/store.js';
import { fetchAllMatches, normalizeCompanionMatch } from '../src/companion.js';
import { allProfileIds } from '../src/accounts.js';

const dryRun = process.argv.includes('--dry-run');
const store = await loadStore(DATA_FILE);
const clanIds = new Set(allProfileIds(PLAYERS));

const raw = new Map();
for (const id of clanIds) {
  console.log(`Henter ${PLAYERS.find((p) => p.profileId === id)?.name ?? 'annen konto'} (${id})`);
  for (const m of await fetchAllMatches(id, console.log)) raw.set(m.matchId, m);
}
console.log(`${raw.size} unike kamper fra aoe2companion`);

// Sjekk mot kamper vi har fra Relic: er `rating` før eller etter kampen, og stemmer civ og resultat?
const check = { before: 0, after: 0, civOk: 0, civBad: 0, wonOk: 0, wonBad: 0 };
for (const [id, m] of raw) {
  const relic = store.matches[id];
  if (!relic) continue;
  for (const p of (m.teams ?? []).flatMap((t) => t.players ?? [])) {
    const r = relic.players.find((x) => x.profileId === p.profileId);
    if (!r || !clanIds.has(p.profileId)) continue;
    if (p.rating != null && p.rating === r.oldRating) check.before++;
    if (p.rating != null && p.rating === r.newRating) check.after++;
    const c = normalizeCompanionMatch({ ...m, teams: [{ players: [p] }] }, { ratingIsBefore: true }).players[0];
    if (c.civId === r.civId) check.civOk++; else check.civBad++;
    if (p.won != null) { if ((p.won === true) === r.won) check.wonOk++; else check.wonBad++; }
  }
}
console.log('Sammenligning med Relic-data:', check);
const ratingIsBefore = check.before >= check.after;
if (check.before + check.after === 0) console.warn('Ingen overlapp å sjekke rating mot; antar at rating er før kampen.');

let added = 0;
let skipped = 0;
let civFixed = 0;
for (const [id, m] of raw) {
  const existing = store.matches[id];
  if (existing) {
    // AI-spillere har profileId -1 og kan ikke skilles fra hverandre, så de hoppes over.
    // Relic bruker en eldre civ-nummerering i kamper fra 2020–2022; aoe2companion har riktig civ
    for (const c of normalizeCompanionMatch(m, { ratingIsBefore }).players) {
      const p = existing.players.find((x) => x.profileId === c.profileId);
      if (p && c.profileId > 0 && c.civId != null && p.civId !== c.civId) {
        p.civId = c.civId;
        civFixed++;
      }
    }
    continue;
  }
  const players = (m.teams ?? []).flatMap((t) => t.players ?? []);
  // Avbrutte kamper og kamper uten vinner gir ikke mening i statistikken
  if (m.abandoned || !players.some((p) => p.won === true)) {
    skipped++;
    continue;
  }
  store.matches[id] = normalizeCompanionMatch(m, { ratingIsBefore });
  added++;
}
console.log(`rating er ${ratingIsBefore ? 'før' : 'etter'} kampen. ${added} nye kamper, civ rettet for ${civFixed} spillere, ${skipped} hoppet over (avbrutt/uten vinner). Totalt ${Object.keys(store.matches).length}.`);

if (dryRun) {
  console.log('--dry-run: lagret ikke.');
} else {
  store.updatedAt = new Date().toISOString();
  await saveStore(DATA_FILE, store);
}
