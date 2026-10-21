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

// Hvor mye vi «burde» vinne ut fra Elo, 0–10 (10 = klare favoritter, 5 = helt jevnt, 0 = klare underdogs).
// Matchmakingen gir nesten alltid jevne lag, så ren vinnersjanse ville havnet på 4–6. Derfor er ett steg
// 25 poeng forskjell i snittrating, slik at 125 eller mer gir 0 eller 10. Vinnersjansen (vanlig Elo-formel) følger med.
const SCORE_STEP = 25;
export function expectedScore(m, clanIds) {
  if (!m.players.some((p) => clanIds.has(p.profileId))) return null;
  const { won, ourRating, theirRating } = sides(m, clanIds);
  if (ourRating == null || theirRating == null) return null;
  const winChance = 1 / (1 + 10 ** ((theirRating - ourRating) / 400));
  const score = Math.min(10, Math.max(0, Math.round(5 + (ourRating - theirRating) / SCORE_STEP)));
  let verdict = 'Jevn kamp';
  if (won && score <= 2) verdict = 'Sjokkseier';
  else if (won && score <= 4) verdict = 'Seier som underdog';
  else if (!won && score >= 8) verdict = 'Burde vunnet';
  else if (!won && score >= 6) verdict = 'Tap som favoritt';
  else if (score !== 5) verdict = 'Som ventet';
  return { score, winChance, ourRating, theirRating, verdict };
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
      if (p.newRating && !p.account && (!peaks.get(p.profileId) || p.newRating > peaks.get(p.profileId).rating)) {
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
      const p = m.players.find((x) => x.profileId === id && !x.account);
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
    expected: expectedScore(m, clanIds),
    mapGames: onMap.length,
    mapWins: onMap.filter((x) => x.players.find((p) => clanIds.has(p.profileId)).won).length,
  };
}

// Formen de siste 5 kampene med minst én av oss, uansett valgt periode.
// 4–5 seire = opp, 2–3 = bortover, 0–1 = ned. Elo-endringen er snittet for oss som spilte, summert over kampene.
const FORM_GAMES = 5;
export function form(store, players) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const last = Object.values(store.matches)
    .filter((m) => m.players.some((p) => clanIds.has(p.profileId)))
    .sort((a, b) => b.start - a.start)
    .slice(0, FORM_GAMES)
    .reverse();
  if (!last.length) return null;
  const games = last.map((m) => {
    const ours = m.players.filter((p) => clanIds.has(p.profileId));
    const changes = ours.map(change).filter((c) => c != null);
    return { ...matchRef(m), won: ours[0].won, eloChange: changes.length ? avg(changes) : null };
  });
  const wins = games.filter((g) => g.won).length;
  const trend = wins >= 4 ? 'up' : wins <= 1 ? 'down' : 'flat';
  return { trend, wins, games, eloChange: games.reduce((sum, g) => sum + (g.eloChange ?? 0), 0) };
}

// Winrate og Elo per lagstørrelse i rangerte lagkamper. Elo per kamp er snittet for oss som spilte.
const TEAM_SIZES = [[7, '2v2'], [8, '3v3'], [9, '4v4']];
export function teamSizes(matches, players) {
  const clanIds = new Set(players.map((p) => p.profileId));
  return TEAM_SIZES.map(([type, name]) => {
    const games = matches.filter((m) => m.matchType === type && m.players.some((p) => clanIds.has(p.profileId)));
    const changes = [];
    const perPlayer = new Map(players.map((p) => [p.profileId, { profileId: p.profileId, games: 0, wins: 0 }]));
    let wins = 0;
    for (const m of games) {
      const ours = m.players.filter((p) => clanIds.has(p.profileId));
      if (ours[0].won) wins++;
      const c = ours.map(change).filter((x) => x != null);
      if (c.length) changes.push(c.reduce((a, b) => a + b, 0) / c.length);
      for (const p of ours) {
        const pp = perPlayer.get(p.profileId);
        pp.games++;
        if (p.won) pp.wins++;
      }
    }
    return {
      key: name,
      name,
      games: games.length,
      wins,
      winRate: games.length ? wins / games.length : null,
      eloPerGame: changes.length ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : null,
      eloTotal: changes.length ? Math.round(changes.reduce((a, b) => a + b, 0)) : null,
      players: [...perPlayer.values()].map((p) => ({ ...p, winRate: p.games ? p.wins / p.games : null })),
    };
  });
}

// Elo-banken: hvor mye lag-RM-Elo hver spiller har vunnet og tapt i perioden, med største gevinst og tap
export function eloBank(matches, players, nameOf) {
  const clanIds = new Set(players.map((p) => p.profileId));
  const bank = new Map(players.map((p) => [p.profileId, {
    profileId: p.profileId, name: nameOf(p.profileId), games: 0, gained: 0, lost: 0, best: null, worst: null,
  }]));
  for (const m of matches) {
    if (!TEAM_RM.has(m.matchType)) continue;
    for (const p of m.players) {
      const c = change(p);
      if (!clanIds.has(p.profileId) || c == null) continue;
      const b = bank.get(p.profileId);
      b.games++;
      if (c >= 0) b.gained += c;
      else b.lost += c;
      if (!b.best || c > b.best.change) b.best = { ...matchRef(m), change: c };
      if (!b.worst || c < b.worst.change) b.worst = { ...matchRef(m), change: c };
    }
  }
  return [...bank.values()].map((b) => ({
    ...b,
    net: b.gained + b.lost,
    perGame: b.games ? Math.round(((b.gained + b.lost) / b.games) * 10) / 10 : null,
  }));
}

// Motstandere vi har møtt på motsatt lag, med hvor ofte vi vant mot dem. Klanens egne kontoer og AI (profile_id -1) telles ikke.
export function opponents(matches, clanIds) {
  const seen = new Map();
  for (const m of matches) {
    const ours = m.players.filter((p) => clanIds.has(p.profileId));
    if (!ours.length) continue;
    for (const p of m.players) {
      if (p.team === ours[0].team || clanIds.has(p.profileId) || p.profileId <= 0) continue;
      const o = seen.get(p.profileId) ?? { profileId: p.profileId, games: 0, wins: 0, last: null };
      o.games++;
      if (ours[0].won) o.wins++;
      if (!o.last || m.start > o.last.start) o.last = { id: m.id, start: m.start, map: mapName(m.mapFile), won: ours[0].won };
      seen.set(p.profileId, o);
    }
  }
  return [...seen.values()];
}

// Erkefiender: dem vi har møtt oftest, og de vi taper og vinner mest mot blant dem vi har møtt mange ganger.
// Navnene ligger i store.opponents, hentet av collector.js for motstandere vi har møtt minst RIVAL_MIN_GAMES ganger.
export const RIVAL_MIN_GAMES = 3;
export function rivals(matches, clanIds, names = {}) {
  const all = opponents(matches, clanIds).map((o) => ({
    ...o,
    name: names[o.profileId]?.name ?? null,
    country: names[o.profileId]?.country ?? null,
    losses: o.games - o.wins,
    winRate: o.wins / o.games,
  }));
  const enough = all.filter((o) => o.games >= RIVAL_MIN_GAMES);
  const byRecord = (a, b) => a.winRate - b.winRate || b.games - a.games;
  return {
    total: all.length,
    minGames: RIVAL_MIN_GAMES,
    mostMet: enough.toSorted((a, b) => b.games - a.games || b.last.start - a.last.start).slice(0, 8),
    nemeses: enough.filter((o) => o.losses > o.wins).sort(byRecord).slice(0, 6),
    victims: enough.filter((o) => o.wins > o.losses).sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 6),
  };
}
