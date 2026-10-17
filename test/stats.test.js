import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatch, normalizeProfiles, mapName } from '../src/normalize.js';
import { computeStats } from '../src/stats.js';
import { PLAYERS } from '../src/config.js';
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
