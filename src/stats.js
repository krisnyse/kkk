// Regner ut all statistikken siden viser, fra lagrede kamper.
import { civName } from './civs.js';
import { mapName, matchTypeName } from './normalize.js';

const TEAM_RM = new Set([7, 8, 9]);

// Kamper fra aoe2companion kan ha civ eller kamptype vi ikke har id for; da brukes navnet direkte
const civKey = (p) => p.civId ?? p.civName;
const civLabel = (key) => (typeof key === 'string' ? key : civName(key));

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

const DAY = 24 * 60 * 60;
const MAX_ELO_POINTS = 400;

// Felles klan-Elo: snittet av lag-RM-ratingen til spillerne, ett punkt per døgn fra periodens start til nå.
// Hver spiller teller med siste rating de hadde ved punktet, så dager uten kamper beholder forrige verdi.
// Ratingen før perioden hentes fra alle lagrede kamper, ellers ville startverdien mangle.
// Uten since (hele perioden) starter tidslinjen ved første lagrede lagkamp. Lange perioder tynnes ut til ca. 400 punkter.
function clanElo(store, players, since, now) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const history = new Map(players.map((p) => [p.profileId, []]));
  for (const m of Object.values(store.matches).sort((a, b) => a.start - b.start)) {
    if (!TEAM_RM.has(m.matchType)) continue;
    for (const p of m.players) {
      if (clanIds.has(p.profileId) && p.newRating) history.get(p.profileId).push({ t: m.start, rating: p.newRating });
    }
  }

  const end = Math.floor(now / 1000);
  const first = Math.min(...[...history.values()].filter((h) => h.length).map((h) => h[0].t));
  const start = since ?? first;
  if (!Number.isFinite(start)) return { current: null, change: null, points: [] };

  const days = Math.max(0, Math.ceil((end - start) / DAY));
  const step = Math.max(1, Math.ceil(days / MAX_ELO_POINTS));
  const points = [];
  for (let day = days; day >= 0; day -= step) {
    const t = end - day * DAY;
    const ratings = [...history.values()].map((h) => h.findLast((x) => x.t <= t)?.rating).filter((r) => r != null);
    if (ratings.length) points.push({ t, rating: Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length), players: ratings.length });
  }
  if (days % step) {
    const ratings = [...history.values()].map((h) => h.findLast((x) => x.t <= end)?.rating).filter((r) => r != null);
    if (ratings.length) points.push({ t: end, rating: Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length), players: ratings.length });
  }
  return {
    current: points.at(-1)?.rating ?? null,
    change: points.length ? points.at(-1).rating - points[0].rating : null,
    points,
  };
}

const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// Siste kamp med minst én av oss, uansett valgt periode, med litt statistikk om den
function lastMatch(store, players, nameOf) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const all = Object.values(store.matches)
    .filter((m) => m.players.some((p) => clanIds.has(p.profileId)))
    .sort((a, b) => b.start - a.start);
  const m = all[0];
  if (!m) return null;

  const ours = m.players.filter((p) => clanIds.has(p.profileId));
  const side = ours[0].team;
  const mine = m.players.filter((p) => p.team === side);
  const theirs = m.players.filter((p) => p.team !== side);
  const rating = (ps) => avg(ps.map((p) => p.oldRating).filter((r) => r));

  const map = mapName(m.mapFile);
  const onMap = all.filter((x) => mapName(x.mapFile) === map);
  const mapWins = onMap.filter((x) => x.players.find((p) => clanIds.has(p.profileId)).won).length;

  return {
    id: m.id,
    start: m.start,
    duration: m.end && m.start ? m.end - m.start : null,
    map,
    type: m.typeName ?? matchTypeName(m.matchType),
    won: ours[0].won,
    teamSize: mine.length,
    clanPlayers: ours.map((p) => ({
      name: nameOf(p.profileId),
      civ: civLabel(civKey(p)),
      ratingChange: p.newRating != null && p.oldRating != null ? p.newRating - p.oldRating : null,
    })),
    ourRating: rating(mine),
    theirRating: rating(theirs),
    mapGames: onMap.length,
    mapWins,
  };
}

// since: unix-sekunder; bare kamper som startet etter dette tas med (null = alle)
// now: millisekunder; tidspunktet klan-Elo-tidslinjen regnes bakover fra
export function computeStats(store, players, { since = null, now = Date.now() } = {}) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const nameOf = (id) => store.profiles[id]?.name ?? players.find((p) => p.profileId === id)?.name ?? String(id);
  const matches = Object.values(store.matches)
    .filter((m) => since == null || m.start >= since)
    .sort((a, b) => a.start - b.start);

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
      tally(s.civs, civKey(p), p.won);
      tally(s.maps, mapName(m.mapFile), p.won);
      tally(clanCivs, civKey(p), p.won);
      if (TEAM_RM.has(m.matchType) && p.newRating) s.ratingHistory.push({ t: m.start, rating: p.newRating });
    }

    // Kamper der minst to av oss var på samme lag
    const byTeam = Map.groupBy(ours, (p) => p.team);
    for (const team of byTeam.values()) {
      if (team.length < 2) continue;
      const key = team.map((p) => p.profileId).sort((a, b) => a - b).join(',');
      tally(lineups, key, team[0].won);
      tally(clanMaps, mapName(m.mapFile), team[0].won);
    }

    recent.push({
      id: m.id,
      start: m.start,
      duration: m.end && m.start ? m.end - m.start : null,
      map: mapName(m.mapFile),
      type: m.typeName ?? matchTypeName(m.matchType),
      teams: [...Map.groupBy(m.players, (p) => p.team).entries()]
        .sort(([a], [b]) => a - b)
        .map(([, ps]) => ({
          won: ps[0].won,
          players: ps.map((p) => ({
            name: clanIds.has(p.profileId) ? nameOf(p.profileId) : null,
            clan: clanIds.has(p.profileId),
            civ: civLabel(civKey(p)),
            ratingChange: p.newRating != null && p.oldRating != null ? p.newRating - p.oldRating : null,
          })),
        })),
    });
  }

  return {
    updatedAt: store.updatedAt,
    since,
    totalMatches: recent.length,
    clanElo: clanElo(store, players, since, now),
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
        civs: toList(s.civs, civLabel).slice(0, 8),
        maps: toList(s.maps).slice(0, 8),
        ratingHistory: s.ratingHistory,
      };
    }),
    lineups: toList(lineups, (k) => k.split(',').map((id) => nameOf(Number(id))).join(' + '))
      .map((l) => ({ ...l, size: l.key.split(',').length })),
    clanCivs: toList(clanCivs, civLabel).slice(0, 12),
    clanMaps: toList(clanMaps).slice(0, 10),
    recent: recent.reverse().slice(0, 25),
    lastMatch: lastMatch(store, players, nameOf),
  };
}
