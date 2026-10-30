// Omregning av lag-RM-Elo fra før omleggingen 13. juli 2022.
//
// Den dagen gjorde utviklerne en engangsjustering av all lag-Elo (RM 2v2–4v4) for å få den ned på
// samme skala som 1v1, og de fleste fikk 300–600 poeng mindre over natta. Formelen ble aldri publisert:
// https://www.ageofempires.com/news/updates-to-ranked-team-game-elo-calculation/
// 1v1 ble ikke endret.
//
// Skalaen under er estimert fra våre egne kamper: siste rating før og første rating etter omleggingen
// for de fem kontoene som spilte lagkamp under tre uker på hver side (1404→1103, 1575→1184, 1582→1198,
// 1604→1210, 1639→1213). Lineær tilpasning gir ny ≈ 0,49 × gammel + 417, med under 10 poeng avvik.
// Utenfor 1400–1650 er den en ekstrapolering. Se scripts/elo-fit.js.

const TEAM_RM = new Set([7, 8, 9]);

export const TEAM_ELO_RESET = {
  // Kunngjort på kvelden 13. juli (Stillehavstid); vi har ingen kamper mellom 10. og 15. juli 2022
  cutoff: Date.UTC(2022, 6, 14) / 1000,
  scale: 0.49,
  offset: 417,
};

export const adjustTeamRating = (r) => (r ? Math.round(TEAM_ELO_RESET.scale * r + TEAM_ELO_RESET.offset) : r);

// Kopi av kampene der lag-RM-ratingen fra før omleggingen er regnet om til dagens skala.
// Lagret data endres ikke.
export function normalizeTeamElo(matches) {
  const out = {};
  for (const [id, m] of Object.entries(matches)) {
    out[id] = TEAM_RM.has(m.matchType) && m.start < TEAM_ELO_RESET.cutoff
      ? { ...m, players: m.players.map((p) => ({ ...p, oldRating: adjustTeamRating(p.oldRating), newRating: adjustTeamRating(p.newRating) })) }
      : m;
  }
  return out;
}
