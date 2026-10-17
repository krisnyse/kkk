// Henter nye kamper og ratinger og legger dem til i lageret.
// API-et gir bare de siste kampene, så historikken bygges opp ved å kjøre dette jevnlig.
import { getPersonalStats, getRecentMatches } from './relic.js';
import { normalizeMatch, normalizeProfiles } from './normalize.js';
import { saveStore } from './store.js';

export async function collect(store, profileIds, file) {
  const [stats, history] = await Promise.all([getPersonalStats(profileIds), getRecentMatches(profileIds)]);

  const profiles = { ...store.profiles, ...normalizeProfiles(stats) };
  const profilesChanged = JSON.stringify(profiles) !== JSON.stringify(store.profiles);
  store.profiles = profiles;

  let added = 0;
  for (const raw of history.matchHistoryStats ?? []) {
    if (!store.matches[raw.id]) added++;
    store.matches[raw.id] = normalizeMatch(raw);
  }
  // Skriv bare når noe er nytt, så GitHub Actions ikke lager en commit hver halvtime
  if (added || profilesChanged) {
    store.updatedAt = new Date().toISOString();
    await saveStore(file, store);
  }
  return added;
}
