// Henter nye kamper og ratinger og legger dem til i lageret.
// API-et gir bare de siste kampene, så historikken bygges opp ved å kjøre dette jevnlig.
import { getPersonalStats, getRecentMatches } from './relic.js';
import { normalizeMatch, normalizeProfiles } from './normalize.js';
import { saveStore } from './store.js';
import { startOfDay } from './periods.js';
import { opponents, RIVAL_MIN_GAMES } from './extras.js';

const NAME_BATCH = 50;

export async function collect(store, profileIds, file) {
  const [stats, history] = await Promise.all([getPersonalStats(profileIds), getRecentMatches(profileIds)]);

  const profiles = { ...store.profiles, ...normalizeProfiles(stats) };
  const profilesChanged = JSON.stringify(profiles) !== JSON.stringify(store.profiles);
  store.profiles = profiles;

  let added = 0;
  for (const raw of history.matchHistoryStats ?? []) {
    // Ferdige kamper endrer seg ikke, og eldre Relic-kamper har feil civ-id-er (rettet fra aoe2companion)
    if (store.matches[raw.id]) continue;
    store.matches[raw.id] = normalizeMatch(raw);
    added++;
  }
  const namesAdded = await lookupOpponents(store, profileIds);

  // Skriv bare når noe er nytt, så GitHub Actions ikke lager en commit hver gang.
  // Unntak: første henting etter midnatt, så «I dag» på nettsiden blir bygget på nytt og ikke viser gårsdagen.
  const newDay = !store.updatedAt || Date.parse(store.updatedAt) / 1000 < startOfDay();
  if (added || profilesChanged || namesAdded || newDay) {
    store.updatedAt = new Date().toISOString();
    await saveStore(file, store);
  }
  return added;
}

// Navn på motstandere vi har møtt flere ganger, til «Erkefiender». Kampene lagrer bare profile_id,
// så navnet slås opp én gang per motstander. De som ikke finnes lagres med navn null, så de ikke spørres om igjen.
async function lookupOpponents(store, profileIds) {
  store.opponents ??= {};
  const missing = opponents(Object.values(store.matches), new Set(profileIds))
    .filter((o) => o.games >= RIVAL_MIN_GAMES && !(o.profileId in store.opponents))
    .map((o) => o.profileId);
  let done = 0;
  for (let i = 0; i < missing.length; i += NAME_BATCH) {
    const batch = missing.slice(i, i + NAME_BATCH);
    try {
      const found = normalizeProfiles(await getPersonalStats(batch));
      for (const id of batch) store.opponents[id] = { name: found[id]?.name ?? null, country: found[id]?.country ?? null };
      done += batch.length;
    } catch (err) {
      // Nye kamper skal lagres selv om navneoppslaget feiler; resten prøves neste gang
      console.error('Klarte ikke å hente motstandernavn:', err.message);
      break;
    }
  }
  return done;
}
