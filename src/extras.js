// Civ-par i 4v4, rekordtavle, ukentlig oppsummering og detaljer for én kamp.
import { civName } from './civs.js';
import { mapName, matchTypeName } from './normalize.js';

const TEAM_RM = new Set([7, 8, 9]);
const RM_4V4 = 9;
const DAY = 24 * 60 * 60;
// Kamper over 3 timer er nesten alltid pauset eller hengt seg opp, og under 5 min er noen som droppet ut
const MAX_GAME = 3 * 60 * 60;
const MIN_GAME = 5 * 60;

const civKey = (p) => p.civId ?? p.civName;
const civLabel = (key) => (typeof key === 'string' ? key : civName(key));
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const change = (p) => (p.newRating != null && p.oldRating != null ? p.newRating - p.oldRating : null);

// Lagets og motstandernes snittrating før kampen, sett fra siden der klanen spilte
function sides(m, clanIds) {
  const ours = m.players.filter((p) => clanIds.has(p.profileId));
  const side = ours[0].team;
  const mine = m.players.filter((p) => p.team === side);
  const theirs = m.players.filter((p) => p.team !== side);
  const rating = (ps) => avg(ps.map((p) => p.oldRating).filter((r) => r));
  return { ours, won: ours[0].won, ourRating: rating(mine), theirRating: rating(theirs) };
}

const matchRef = (m) => ({ id: m.id, start: m.start, map: mapName(m.mapFile), type: m.typeName ?? matchTypeName(m.matchType) });

// Civ-par blant oss når alle fire spiller 4v4 på samme lag. Hver kamp gir seks par.
export function civPairs4v4(matches, clanIds) {
  const pairs = new Map();
  let games = 0;
  for (const m of matches) {
    if (m.matchType !== RM_4V4) continue;
    const ours = m.players.filter((p) => clanIds.has(p.profileId));
    if (ours.length !== 4 || new Set(ours.map((p) => p.team)).size !== 1) continue;
    games++;
    for (let i = 0; i < ours.length; i++) {
      for (let j = i + 1; j < ours.length; j++) {
        const key = [civLabel(civKey(ours[i])), civLabel(civKey(ours[j]))].sort().join(' + ');
        const t = pairs.get(key) ?? { games: 0, wins: 0 };
        t.games++;
        if (ours[0].won) t.wins++;
        pairs.set(key, t);
      }
    }
  }
  const all = [...pairs.entries()].map(([key, t]) => ({ key, name: key, ...t, winRate: t.wins / t.games }));
  const minGames = Math.max(3, Math.round(Math.max(0, ...all.map((p) => p.games)) * 0.15));
  const enough = all.filter((p) => p.games >= minGames).sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  return { games, minGames, best: enough.slice(0, 8), worst: enough.slice(-8).reverse() };
}

// Rekorder fra rangerte lagkamper i perioden
export function records(matches, clanIds, nameOf) {
  let upset = null;
  let favLoss = null;
  let longest = null;
  let shortestWin = null;
  let bestGain = null;
  let worstDrop = null;
  const peaks = new Map();
  const days = new Map();
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' });

  for (const m of matches) {
    if (!TEAM_RM.has(m.matchType)) continue;
    if (!m.players.some((p) => clanIds.has(p.profileId))) continue;
    const s = sides(m, clanIds);
    const diff = s.ourRating != null && s.theirRating != null ? s.theirRating - s.ourRating : null;
    if (diff != null && s.won && diff > 0 && (!upset || diff > upset.diff)) upset = { ...matchRef(m), diff, ourRating: s.ourRating, theirRating: s.theirRating };
    if (diff != null && !s.won && diff < 0 && (!favLoss || -diff > favLoss.diff)) favLoss = { ...matchRef(m), diff: -diff, ourRating: s.ourRating, theirRating: s.theirRating };

    const duration = m.end && m.start ? m.end - m.start : null;
    if (duration && duration <= MAX_GAME && (!longest || duration > longest.duration)) longest = { ...matchRef(m), duration, won: s.won };
    if (duration && duration >= MIN_GAME && s.won && (!shortestWin || duration < shortestWin.duration)) shortestWin = { ...matchRef(m), duration };

    for (const p of s.ours) {
      const c = change(p);
      if (c != null && (!bestGain || c > bestGain.change)) bestGain = { ...matchRef(m), name: nameOf(p.profileId), change: c };
      if (c != null && (!worstDrop || c < worstDrop.change)) worstDrop = { ...matchRef(m), name: nameOf(p.profileId), change: c };
      if (p.newRating && (!peaks.get(p.profileId) || p.newRating > peaks.get(p.profileId).rating)) {
        peaks.set(p.profileId, { name: nameOf(p.profileId), rating: p.newRating, start: m.start, id: m.id });
      }
    }

    const day = dayFmt.format(new Date(m.start * 1000));
    const d = days.get(day) ?? { day, games: 0, wins: 0 };
    d.games++;
    if (s.won) d.wins++;
    days.set(day, d);
  }

  const busiest = [...days.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)[0] ?? null;
  return {
    upset,
    favLoss,
    longest,
    shortestWin,
    bestGain,
    worstDrop,
    busiestDay: busiest,
    peaks: [...peaks.values()].sort((a, b) => b.rating - a.rating),
  };
}

// Siste 7 dager, uansett valgt periode
export function weekly(store, players, now) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const nameOf = (id) => store.profiles[id]?.name ?? players.find((p) => p.profileId === id)?.name ?? String(id);
  const to = Math.floor(now / 1000);
  const from = to - 7 * DAY;
  const all = Object.values(store.matches).sort((a, b) => a.start - b.start);
  const week = all.filter((m) => m.start >= from && m.start <= to && m.players.some((p) => clanIds.has(p.profileId)));

  // Klan-Elo ved starten og slutten av uka, regnet som i klan-Elo-panelet
  const lastRating = (id, t) => {
    let r = null;
    for (const m of all) {
      if (m.start > t) break;
      if (!TEAM_RM.has(m.matchType)) continue;
      const p = m.players.find((x) => x.profileId === id);
      if (p?.newRating) r = p.newRating;
    }
    return r;
  };
  const clanEloAt = (t) => avg(players.map((p) => lastRating(p.profileId, t)).filter((r) => r != null));
  const eloStart = clanEloAt(from);
  const eloEnd = clanEloAt(to);

  const perPlayer = new Map(players.map((p) => [p.profileId, { profileId: p.profileId, name: nameOf(p.profileId), games: 0, wins: 0, ratingChange: 0 }]));
  const maps = new Map();
  let wins = 0;
  let bestWin = null;
  for (const m of week) {
    const s = sides(m, clanIds);
    if (s.won) wins++;
    for (const p of s.ours) {
      const pp = perPlayer.get(p.profileId);
      pp.games++;
      if (p.won) pp.wins++;
      if (TEAM_RM.has(m.matchType)) pp.ratingChange += change(p) ?? 0;
    }
    const map = mapName(m.mapFile);
    const t = maps.get(map) ?? { name: map, games: 0, wins: 0 };
    t.games++;
    if (s.won) t.wins++;
    maps.set(map, t);
    const diff = s.ourRating != null && s.theirRating != null ? s.theirRating - s.ourRating : null;
    if (s.won && diff != null && (!bestWin || diff > bestWin.diff)) bestWin = { ...matchRef(m), diff };
  }

  const active = [...perPlayer.values()].filter((p) => p.games);
  const topPlayer = active.sort((a, b) => b.ratingChange - a.ratingChange || b.wins - a.wins)[0] ?? null;
  const topMap = [...maps.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)[0] ?? null;
  return {
    from,
    to,
    games: week.length,
    wins,
    winRate: week.length ? wins / week.length : null,
    clanElo: eloEnd,
    clanEloChange: eloStart != null && eloEnd != null ? eloEnd - eloStart : null,
    topPlayer,
    topMap,
    bestWin,
    players: [...perPlayer.values()],
  };
}

// Alt om én kamp, til kampsiden
export function matchDetail(store, players, id) {
  const m = store.matches[id];
  if (!m) return null;
  const clanIds = new Set(players.map((p) => p.profileId));
  const nameOf = (pid) => store.profiles[pid]?.name ?? players.find((p) => p.profileId === pid)?.name ?? String(pid);
  const hasClan = m.players.some((p) => clanIds.has(p.profileId));
  const map = mapName(m.mapFile);
  const onMap = hasClan
    ? Object.values(store.matches).filter((x) => mapName(x.mapFile) === map && x.players.some((p) => clanIds.has(p.profileId)))
    : [];

  return {
    ...matchRef(m),
    duration: m.end && m.start ? m.end - m.start : null,
    won: hasClan ? m.players.find((p) => clanIds.has(p.profileId)).won : null,
    teams: [...Map.groupBy(m.players, (p) => p.team).entries()]
      .sort(([a], [b]) => a - b)
      .map(([team, ps]) => ({
        team,
        won: ps[0].won,
        avgRating: avg(ps.map((p) => p.oldRating).filter((r) => r)),
        players: ps.map((p) => ({
          profileId: p.profileId > 0 ? p.profileId : null,
          clan: clanIds.has(p.profileId),
          name: clanIds.has(p.profileId) ? nameOf(p.profileId) : null,
          civ: civLabel(civKey(p)),
          oldRating: p.oldRating ?? null,
          newRating: p.newRating ?? null,
          change: change(p),
        })),
      })),
    mapGames: onMap.length,
    mapWins: onMap.filter((x) => x.players.find((p) => clanIds.has(p.profileId)).won).length,
  };
}
