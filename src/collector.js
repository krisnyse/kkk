// Henter nye kamper og ratinger og legger dem til i lageret.
// API-et gir bare de siste kampene, så historikken bygges opp ved å kjøre dette jevnlig.
import { getPersonalStats, getRecentMatches } from './relic.js';
import { normalizeMatch, normalizeProfiles } from './normalize.js';
import { saveStore } from './store.js';
import { startOfDay } from './periods.js';

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
  // Skriv bare når noe er nytt, så GitHub Actions ikke lager en commit hver gang.
  // Unntak: første henting etter midnatt, så «I dag» på nettsiden blir bygget på nytt og ikke viser gårsdagen.
  const newDay = !store.updatedAt || Date.parse(store.updatedAt) / 1000 < startOfDay();
  if (added || profilesChanged || newDay) {
    store.updatedAt = new Date().toISOString();
    await saveStore(file, store);
  }
  return added;
}
