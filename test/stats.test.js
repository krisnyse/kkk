import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatch, normalizeProfiles, mapName } from '../src/normalize.js';
import { computeStats } from '../src/stats.js';
import { PLAYERS } from '../src/config.js';
import { allProfileIds, mergeAccounts } from '../src/accounts.js';
import { personalStats, matchHistory } from './fixtures.js';

function buildStore() {
  const matches = Object.fromEntries(matchHistory.matchHistoryStats.map((m) => [m.id, normalizeMatch(m)]));
  return { matches, profiles: normalizeProfiles(personalStats), updatedAt: '2026-10-17T10:00:00Z' };
}

test('profiler får rating fra riktig ladder', () => {
  const p = normalizeProfiles(personalStats);
  assert.equal(p[387309].name, 'OnklG');
  assert.equal(p[387309].ratings.rmTeam.rating, 1256);
  assert.equal(p[384880].ratings.rmTeam.wins, 786);
});

test('kartnavn blir lesbare', () => {
  assert.equal(mapName('Black_Forest.rms'), 'Black Forest');
  assert.equal(mapName('CoastalForest.rms'), 'Coastal Forest');
  assert.equal(mapName('goldenpit.rms2'), 'Goldenpit');
});

test('statistikk per spiller og lagoppsett', () => {
  const s = computeStats(buildStore(), PLAYERS);
  const onklg = s.players.find((p) => p.profileId === 387309);
  assert.equal(onklg.games, 4);
  assert.equal(onklg.wins, 1);
  // Kun rangerte lagkamper (type 7-9) i ratinggrafen
  assert.deepEqual(onklg.ratingHistory.map((h) => h.rating), [1290, 1257, 1223]);

  const full = s.lineups.find((l) => l.size === 4);
  assert.deepEqual({ games: full.games, wins: full.wins }, { games: 2, wins: 1 });
  const duo = s.lineups.find((l) => l.key === '384303,387309');
  assert.equal(duo.games, 1);

  assert.equal(s.recent[0].id, 514148551);
  assert.equal(s.recent[0].teams[1].players.find((p) => p.name === 'DataPaven').civ, 'Danes');
});

test('statistikk kan begrenses til en tidsperiode', async () => {
  const { periodStart } = await import('../src/periods.js');
  const store = buildStore();
  // Fixture-kampene er fra 2020 og okt. 2026; «siste uke» regnet fra 17. okt 2026 tar bare de nyeste
  const now = Date.parse('2026-10-17T12:00:00Z');
  const week = computeStats(store, PLAYERS, { since: periodStart('1w', now) });
  assert.equal(week.totalMatches, 2);
  assert.equal(computeStats(store, PLAYERS, { since: periodStart('all', now) }).totalMatches, 4);
  assert.equal(computeStats(store, PLAYERS, { since: periodStart('5y', now) }).totalMatches, 3);
});

test('rekordtavla er all time og følger ikke periodevalget', async () => {
  const { periodStart } = await import('../src/periods.js');
  const store = buildStore();
  const now = Date.parse('2026-10-17T12:00:00Z');
  const all = computeStats(store, PLAYERS, { since: null, now }).records;
  const week = computeStats(store, PLAYERS, { since: periodStart('1w', now), now }).records;
  assert.deepEqual(week, all);
});

test('klan-Elo er snittet av siste lag-RM-rating per spiller, dag for dag', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const t = (daysAgo) => now / 1000 - daysAgo * 86400;
  const team = (id, start, ratings) => ({
    id, mapFile: 'Arabia.rms', matchType: 7, start, end: start + 1800,
    players: Object.entries(ratings).map(([profileId, newRating]) => ({ profileId: Number(profileId), team: 1, won: true, oldRating: newRating, newRating })),
  });
  const store = {
    profiles: {},
    matches: {
      1: team(1, t(60), { 387309: 1200, 385760: 1000 }), // før måneden: gir startverdien
      2: team(2, t(10), { 387309: 1300 }),
      3: { ...team(3, t(5), { 385760: 900 }), matchType: 6 }, // 1v1 teller ikke
    },
  };
  // Klan-Elo følger valgt periode: 30 dager gir 31 daglige punkter
  const { clanElo } = computeStats(store, PLAYERS, { since: t(30), now });
  assert.equal(clanElo.points.length, 31);
  assert.equal(clanElo.points[0].rating, 1100);
  assert.equal(clanElo.points[0].players, 2);
  assert.equal(clanElo.current, 1150);
  assert.equal(clanElo.change, 50);

  // Hele perioden starter ved første lagkamp (60 dager siden)
  const all = computeStats(store, PLAYERS, { since: null, now }).clanElo;
  assert.equal(all.points.length, 61);
  assert.equal(all.points[0].rating, 1100);
  assert.equal(all.change, 50);
});

test('siste kamp har resultat, rating og kartstatistikk', () => {
  const m = (id, start, won, map = 'Arabia.rms') => ({
    id, mapFile: map, matchType: 7, start, end: start + 1200,
    players: [
      { profileId: 387309, civId: 1, team: 1, won, oldRating: 1200, newRating: won ? 1210 : 1190 },
      { profileId: 999, civId: 2, team: 2, won: !won, oldRating: 1100, newRating: 1100 },
    ],
  });
  // Etter omleggingen av lag-Elo i 2022, så ratingene ikke regnes om
  const t0 = 1_800_000_000;
  const store = { profiles: {}, matches: { 1: m(1, t0 + 1000, true), 2: m(2, t0 + 2000, false) } };
  const lm = computeStats(store, PLAYERS, { now: (t0 + 3000) * 1000 }).lastMatch;
  assert.equal(lm.id, 2);
  assert.equal(lm.won, false);
  assert.equal(lm.clanPlayers[0].ratingChange, -10);
  assert.equal(lm.ourRating, 1200);
  assert.equal(lm.theirRating, 1100);
  assert.equal(lm.mapGames, 2);
  assert.equal(lm.mapWins, 1);
});

test('trender: rekker, ratingforskjell og fiende-civer', () => {
  const s = computeStats(buildStore(), PLAYERS);
  const onklg = s.players.find((p) => p.profileId === 387309);
  assert.equal(onklg.streaks.bestWin + onklg.streaks.bestLoss > 0, true);
  const t = s.trends;
  const games = (rows) => rows.reduce((n, r) => n + r.games, 0);
  // Hver rangert lagkamp havner i nøyaktig én måned, én ukedag og ett tidsrom
  assert.equal(games(t.byMonth), games(t.byWeekday));
  assert.equal(games(t.byWeekday), games(t.byHour));
  assert.ok(t.byMonth.every((m, i) => i === 0 || t.byMonth[i - 1].key < m.key));
  assert.ok(t.enemyCivs.worst.every((c) => c.games >= t.enemyCivs.minGames));
});

test('civ-par i 4v4, rekorder, ukesoppsummering og kampside', async () => {
  const { civPairs4v4, records, weekly, matchDetail } = await import('../src/extras.js');
  const ids = PLAYERS.map((p) => p.profileId);
  const p = (profileId, team, won, civId, oldRating, newRating) => ({ profileId, team, won, civId, oldRating, newRating });
  const now = Date.parse('2026-10-17T12:00:00Z');
  const t = (daysAgo) => now / 1000 - daysAgo * 86400;
  const four = (id, start, won, civs, ours, theirs) => ({
    id, mapFile: 'Arabia.rms', matchType: 9, start, end: start + 30 * 60,
    players: [
      ...ids.map((pid, i) => p(pid, 1, won, civs[i], ours, ours + (won ? 10 : -10))),
      ...[11, 12, 13, 14].map((pid) => p(pid, 2, !won, 5, theirs, theirs)),
    ],
  });
  const store = {
    profiles: {},
    matches: {
      1: four(1, t(20), true, [1, 2, 3, 4], 1000, 1150),
      2: four(2, t(10), true, [1, 2, 5, 6], 1100, 1000),
      3: four(3, t(2), false, [1, 2, 3, 4], 1200, 1100),
    },
  };
  const matches = Object.values(store.matches);
  const clanIds = new Set(ids);

  const pairs = civPairs4v4(matches, clanIds);
  assert.equal(pairs.games, 3);
  // Civ 1 og 2 var med i alle tre kampene, og vant to
  const both = [...pairs.best, ...pairs.worst].find((x) => x.games === 3);
  assert.deepEqual({ games: both.games, wins: both.wins }, { games: 3, wins: 2 });

  const r = records(matches, clanIds, String);
  assert.equal(r.upset.id, 1);
  assert.equal(r.upset.diff, 150);
  assert.equal(r.favLoss.id, 3);
  assert.equal(r.bestGain.change, 10);
  assert.equal(r.peaks.length, 4);

  const w = weekly(store, PLAYERS, now);
  assert.equal(w.games, 1);
  assert.equal(w.wins, 0);
  // Klan-Elo går fra 1110 (etter kamp 2) til 1190 (etter kamp 3)
  assert.equal(w.clanEloChange, 80);

  const d = matchDetail(store, PLAYERS, '3');
  assert.equal(d.won, false);
  assert.equal(d.teams.length, 2);
  assert.equal(d.teams[0].avgRating, 1200);
  assert.equal(d.mapGames, 3);
  assert.equal(matchDetail(store, PLAYERS, '999'), null);
});

test('burde vunnet-score fra Elo', async () => {
  const { expectedScore } = await import('../src/extras.js');
  const clanIds = new Set(PLAYERS.map((p) => p.profileId));
  const match = (our, their, won) => ({
    players: [
      { profileId: 387309, team: 1, won, oldRating: our },
      { profileId: 1, team: 2, won: !won, oldRating: their },
    ],
  });
  assert.equal(expectedScore(match(1200, 1200, true), clanIds).score, 5);
  // 75 høyere gir 8 av 10 (ett steg per 25 poeng), og 200 høyere når taket
  const eight = expectedScore(match(1275, 1200, true), clanIds);
  assert.deepEqual([eight.score, eight.verdict], [8, 'Som ventet']);
  assert.equal(expectedScore(match(1200, 1240, true), clanIds).verdict, 'Seier som underdog');
  assert.equal(expectedScore(match(1240, 1200, false), clanIds).verdict, 'Tap som favoritt');
  const fav = expectedScore(match(1400, 1200, false), clanIds);
  assert.equal(fav.score, 10);
  assert.ok(Math.abs(fav.winChance - 0.76) < 0.01);
  assert.equal(fav.verdict, 'Burde vunnet');
  const dog = expectedScore(match(1200, 1400, true), clanIds);
  assert.equal(dog.score, 0);
  assert.equal(dog.verdict, 'Sjokkseier');
  assert.equal(expectedScore(match(null, 1400, true), clanIds), null);
});

test('form ut fra de siste 5 kampene', async () => {
  const { form } = await import('../src/extras.js');
  const store = (results) => ({
    matches: Object.fromEntries(results.map((won, i) => [i, {
      id: i, start: 1000 + i, mapFile: 'arabia.rms', matchType: 9,
      players: [
        { profileId: 387309, team: 1, won, oldRating: 1200, newRating: won ? 1210 : 1190 },
        { profileId: 1, team: 2, won: !won },
      ],
    }])),
  });
  // Den eldste kampen er utenfor de siste 5
  const up = form(store([false, true, true, false, true, true]), PLAYERS);
  assert.deepEqual([up.trend, up.wins, up.games.length, up.eloChange], ['up', 4, 5, 30]);
  assert.deepEqual(up.games.map((g) => g.won), [true, true, false, true, true]);
  assert.equal(form(store([true, false, true, false, false]), PLAYERS).trend, 'flat');
  assert.equal(form(store([false, false, true, false, false]), PLAYERS).trend, 'down');
  assert.equal(form({ matches: {} }, PLAYERS), null);
});

test('fetchedAt er siste henting, ellers siste oppdatering av data', () => {
  const store = { ...buildStore(), updatedAt: '2026-10-17T18:00:00.000Z' };
  assert.equal(computeStats(store, PLAYERS).fetchedAt, '2026-10-17T18:00:00.000Z');
  assert.equal(computeStats(store, PLAYERS, { fetchedAt: '2026-10-17T19:10:00.000Z' }).fetchedAt, '2026-10-17T19:10:00.000Z');
});

test('«I dag» starter ved midnatt norsk tid', async () => {
  const { periodStart } = await import('../src/periods.js');
  // 17. okt. 2026 er sommertid (UTC+2): midnatt i Oslo er 22:00 UTC dagen før
  assert.equal(periodStart('today', Date.parse('2026-10-17T21:30:00Z')), Date.parse('2026-10-16T22:00:00Z') / 1000);
  assert.equal(periodStart('today', Date.parse('2026-10-17T22:30:00Z')), Date.parse('2026-10-17T22:00:00Z') / 1000);
  // Vintertid (UTC+1)
  assert.equal(periodStart('today', Date.parse('2026-12-01T12:00:00Z')), Date.parse('2026-11-30T23:00:00Z') / 1000);
});

test('klan-Elo for «I dag» starter ved midnatt', async () => {
  const { periodStart } = await import('../src/periods.js');
  const now = Date.parse('2026-10-17T12:00:00Z');
  const since = periodStart('today', now);
  const elo = computeStats(buildStore(), PLAYERS, { since, now }).clanElo;
  if (elo.points.length) assert.equal(elo.points[0].t, since);
});

test('kamper på andre kontoer telles som hovedkontoen, men ikke i ratinggrafen', () => {
  const store = buildStore();
  // Gjør Tom Lobby (384880) om til en annen konto i én lagkamp der han ikke er med fra før
  const m = Object.values(store.matches).find((x) => x.matchType === 7 && !x.players.some((p) => p.profileId === 384880));
  m.players.push({ profileId: 6903748, civId: 1, team: m.players[0].team, won: m.players[0].won, oldRating: 900, newRating: 916 });
  const players = PLAYERS.map(({ otherAccounts, ...p }) => (p.profileId === 384880 ? { ...p, otherAccounts: [6903748] } : p));

  const before = computeStats(store, players).players.find((p) => p.profileId === 384880);
  const after = computeStats(mergeAccounts(store, players), players).players.find((p) => p.profileId === 384880);
  assert.equal(after.games, before.games + 1);
  assert.deepEqual(after.ratingHistory, before.ratingHistory);
  assert.ok(mergeAccounts(store, players).matches[m.id].players.some((p) => p.profileId === 384880 && p.account === 6903748));
  // Lageret selv endres ikke
  assert.ok(m.players.some((p) => p.profileId === 6903748));
  assert.deepEqual(allProfileIds(players).slice(2, 4), [384880, 6903748]);
});

test('beste prestasjon er seieren med lavest vinnersjanse', () => {
  const ids = PLAYERS.map((p) => p.profileId);
  const game = (id, start, won, ours, theirs, matchType = 8) => ({
    id, start, end: start + 1800, mapFile: 'Arabia.rms', matchType,
    players: [
      { profileId: ids[0], team: 1, won, civId: 1, oldRating: ours, newRating: ours + 10 },
      { profileId: 900 + id, team: 2, won: !won, civId: 2, oldRating: theirs, newRating: theirs - 10 },
    ],
  });
  const store = {
    profiles: {},
    matches: {
      1: game(1, 1000, true, 1200, 1250),
      2: game(2, 2000, true, 1100, 1300), // størst underdog-seier
      3: game(3, 3000, false, 1000, 1400), // tap teller ikke
      4: game(4, 4000, true, 1000, 1400, 6), // 1v1 teller ikke
    },
  };
  assert.equal(computeStats(store, PLAYERS).bestPerformance.id, 2);
  assert.equal(computeStats(store, PLAYERS, { since: 1500 }).bestPerformance.id, 2);
  assert.equal(computeStats(store, PLAYERS, { since: 2500 }).bestPerformance, null);
});

test('lagstørrelse, Elo-banken og erkefiender', () => {
  const [a, b] = PLAYERS.map((p) => p.profileId);
  const game = (id, matchType, won, opponent, changeA, changeB = null) => ({
    id, start: 1_800_000_000 + id * 1000, end: 1_800_000_000 + id * 1000 + 1800, mapFile: 'Arabia.rms', matchType,
    players: [
      { profileId: a, team: 1, won, civId: 1, oldRating: 1200, newRating: 1200 + changeA },
      ...(changeB == null ? [] : [{ profileId: b, team: 1, won, civId: 1, oldRating: 1200, newRating: 1200 + changeB }]),
      { profileId: opponent, team: 2, won: !won, civId: 2, oldRating: 1200, newRating: 1200 },
      { profileId: -1, team: 2, won: !won, civId: 2 }, // AI teller ikke som motstander
    ],
  });
  const store = {
    profiles: {},
    opponents: { 777: { name: 'Plageånden', country: 'se' } },
    matches: {
      1: game(1, 7, false, 777, -12, -10),
      2: game(2, 7, false, 777, -14),
      3: game(3, 9, true, 777, 16, 20),
      4: game(4, 9, false, 777, -8),
      5: game(5, 8, true, 888, 10),
      6: game(6, 0, true, 888, 0), // egendefinert: med i erkefiender, ikke i Elo
      7: game(7, 0, true, 888, 0),
    },
  };
  const s = computeStats(store, PLAYERS);

  const sizes = Object.fromEntries(s.teamSizes.map((x) => [x.name, x]));
  assert.deepEqual([sizes['2v2'].games, sizes['2v2'].wins, sizes['2v2'].eloPerGame], [2, 0, -12.5]);
  assert.deepEqual([sizes['4v4'].games, sizes['4v4'].wins, sizes['4v4'].eloPerGame], [2, 1, 5]);
  assert.equal(sizes['4v4'].players.find((p) => p.profileId === b).games, 1);

  const bankA = s.eloBank.find((x) => x.profileId === a);
  assert.deepEqual([bankA.games, bankA.gained, bankA.lost, bankA.net], [5, 26, -34, -8]);
  assert.equal(bankA.best.id, 3);
  assert.equal(bankA.worst.id, 2);

  const r = s.rivals;
  assert.equal(r.total, 2);
  assert.deepEqual(r.mostMet.map((o) => o.profileId), [777, 888]);
  assert.deepEqual([r.nemeses[0].name, r.nemeses[0].wins, r.nemeses[0].losses], ['Plageånden', 1, 3]);
  assert.deepEqual(r.victims.map((o) => o.profileId), [888]);
  assert.equal(r.victims[0].name, null);
});

test('collect slår opp navn på motstandere vi har møtt flere ganger, bare én gang', async () => {
  const { collect } = await import('../src/collector.js');
  const { tmpdir } = await import('node:os');
  const [a] = PLAYERS.map((p) => p.profileId);
  const game = (id, opponent) => ({
    id, start: id, end: id + 1800, mapFile: 'Arabia.rms', matchType: 7,
    players: [{ profileId: a, team: 1, won: true }, { profileId: opponent, team: 2, won: false }],
  });
  const store = { profiles: {}, matches: { 1: game(1, 777), 2: game(2, 777), 3: game(3, 777), 4: game(4, 888) }, updatedAt: null };
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const ids = JSON.parse(u.searchParams.get('profile_ids'));
    const body = u.pathname.endsWith('GetPersonalStat')
      ? { statGroups: ids.filter((id) => id === 777).map((id) => ({ id: id + 1, members: [{ profile_id: id, alias: 'Plageånden', country: 'se' }] })), leaderboardStats: [] }
      : { matchHistoryStats: [] };
    asked.push(...ids);
    return { ok: true, json: async () => ({ result: { code: 0 }, ...body }) };
  };
  try {
    const file = `${tmpdir()}/kkk-collect-test-${process.pid}.json`;
    await collect(store, [a], file);
    assert.deepEqual(store.opponents, { 777: { name: 'Plageånden', country: 'se' } });
    asked.length = 0;
    await collect(store, [a], file);
    assert.ok(!asked.includes(777));
  } finally {
    globalThis.fetch = realFetch;
  }
});
