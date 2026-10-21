// Noen spillere har hatt flere kontoer. Kampene fra de andre kontoene lagres med sin egen profile_id,
// men telles som hovedkontoen når statistikken regnes ut.

// Alle profile_id-er vi henter kamper for, også de andre kontoene
export function allProfileIds(players) {
  return players.flatMap((p) => [p.profileId, ...(p.otherAccounts ?? [])]);
}

// Kopi av lageret der spillere på andre kontoer har fått hovedkontoens profileId.
// Den opprinnelige kontoen står i `account`, så ratinggrafene kan holde den egne ratingen deres utenfor.
export function mergeAccounts(store, players) {
  const main = new Map(players.flatMap((p) => (p.otherAccounts ?? []).map((id) => [id, p.profileId])));
  if (!main.size) return store;
  const matches = {};
  for (const [id, m] of Object.entries(store.matches)) {
    matches[id] = m.players.some((p) => main.has(p.profileId))
      ? { ...m, players: m.players.map((p) => (main.has(p.profileId) ? { ...p, profileId: main.get(p.profileId), account: p.profileId } : p)) }
      : m;
  }
  return { ...store, matches };
}
