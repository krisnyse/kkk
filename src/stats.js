// Regner ut all statistikken siden viser, fra lagrede kamper.
import { civName } from './civs.js';
import { mapName, matchTypeName } from './normalize.js';

const TEAM_RM = new Set([7, 8, 9]);

function tally(map, key, won) {
  const t = map.get(key) ?? { games: 0, wins: 0 };
  t.games++;
  if (won) t.wins++;
  map.set(key, t);
}

// Map -> sortert liste med winrate, mest spilt først
function toList(map, label = (k) => k) {
  return [...map.entries()]
    .map(([key, t]) => ({ key, name: label(key), ...t, winRate: t.wins / t.games }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

export function computeStats(store, players) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const nameOf = (id) => store.profiles[id]?.name ?? players.find((p) => p.profileId === id)?.name ?? String(id);
  const matches = Object.values(store.matches).sort((a, b) => a.start - b.start);

  const perPlayer = new Map(players.map((p) => [p.profileId, {
    games: 0, wins: 0, civs: new Map(), maps: new Map(), ratingHistory: [],
  }]));
  const lineups = new Map();
  const clanCivs = new Map();
  const clanMaps = new Map();
  const recent = [];

  for (const m of matches) {
    const ours = m.players.filter((p) => clanIds.has(p.profileId));
    if (!ours.length) continue;

    for (const p of ours) {
      const s = perPlayer.get(p.profileId);
      s.games++;
      if (p.won) s.wins++;
      tally(s.civs, p.civId, p.won);
      tally(s.maps, m.mapFile, p.won);
      tally(clanCivs, p.civId, p.won);
      if (TEAM_RM.has(m.matchType) && p.newRating) s.ratingHistory.push({ t: m.end || m.start, rating: p.newRating });
    }

    // Kamper der minst to av oss var på samme lag
    const byTeam = Map.groupBy(ours, (p) => p.team);
    for (const team of byTeam.values()) {
      if (team.length < 2) continue;
      const key = team.map((p) => p.profileId).sort((a, b) => a - b).join(',');
      tally(lineups, key, team[0].won);
      tally(clanMaps, m.mapFile, team[0].won);
    }

    recent.push({
      id: m.id,
      start: m.start,
      duration: m.end && m.start ? m.end - m.start : null,
      map: mapName(m.mapFile),
      type: matchTypeName(m.matchType),
      teams: [...Map.groupBy(m.players, (p) => p.team).entries()]
        .sort(([a], [b]) => a - b)
        .map(([, ps]) => ({
          won: ps[0].won,
          players: ps.map((p) => ({
            name: clanIds.has(p.profileId) ? nameOf(p.profileId) : null,
            clan: clanIds.has(p.profileId),
            civ: civName(p.civId),
            ratingChange: p.newRating != null && p.oldRating != null ? p.newRating - p.oldRating : null,
          })),
        })),
    });
  }

  return {
    updatedAt: store.updatedAt,
    totalMatches: recent.length,
    players: players.map(({ profileId }) => {
      const s = perPlayer.get(profileId);
      const profile = store.profiles[profileId] ?? {};
      return {
        profileId,
        name: nameOf(profileId),
        country: profile.country ?? null,
        ratings: profile.ratings ?? {},
        games: s.games,
        wins: s.wins,
        winRate: s.games ? s.wins / s.games : null,
        civs: toList(s.civs, civName).slice(0, 8),
        maps: toList(s.maps, mapName).slice(0, 8),
        ratingHistory: s.ratingHistory,
      };
    }),
    lineups: toList(lineups, (k) => k.split(',').map((id) => nameOf(Number(id))).join(' + '))
      .map((l) => ({ ...l, size: l.key.split(',').length })),
    clanCivs: toList(clanCivs, civName).slice(0, 12),
    clanMaps: toList(clanMaps, mapName).slice(0, 10),
    recent: recent.reverse().slice(0, 25),
  };
}
