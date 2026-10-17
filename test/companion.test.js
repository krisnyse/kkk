import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompanionMatch } from '../src/companion.js';
import { computeStats } from '../src/stats.js';
import { PLAYERS } from '../src/config.js';

// Forkortet kamp i aoe2companion-formatet
const raw = {
  matchId: 400000001,
  started: '2021-06-07T19:00:00.000Z',
  finished: '2021-06-07T19:40:00.000Z',
  leaderboardId: 'rm_team',
  leaderboardName: 'Team Random Map',
  mapName: 'Arabia',
  teams: [
    { teamId: 1, players: [
      { profileId: 387309, civName: 'Khmer', team: 1, won: true, rating: 1200, ratingDiff: 14 },
      { profileId: 384880, civName: 'Mayans', team: 1, won: true, rating: 1180, ratingDiff: 15 },
    ] },
    { teamId: 2, players: [
      { profileId: 1, civName: 'Franks', team: 2, won: false, rating: 1190, ratingDiff: -14 },
      { profileId: 2, civName: 'Nyciv', team: 2, won: false, rating: 1170, ratingDiff: -15 },
    ] },
  ],
};

test('aoe2companion-kamp gjøres om til samme format som Relic-kamper', () => {
  const m = normalizeCompanionMatch(raw, { ratingIsBefore: true });
  assert.equal(m.id, 400000001);
  assert.equal(m.matchType, 7);
  assert.equal(m.start, 1623092400);
  const onklg = m.players.find((p) => p.profileId === 387309);
  assert.deepEqual([onklg.civId, onklg.team, onklg.won, onklg.oldRating, onklg.newRating], [24, 1, true, 1200, 1214]);
  assert.equal(m.players.find((p) => p.profileId === 384880).civId, 30); // Mayans -> Maya
  assert.deepEqual(m.players.find((p) => p.profileId === 2).civName, 'Nyciv');

  const after = normalizeCompanionMatch(raw, { ratingIsBefore: false }).players[0];
  assert.deepEqual([after.oldRating, after.newRating], [1186, 1200]);
});

test('statistikk tåler kamper fra aoe2companion', () => {
  const m = normalizeCompanionMatch(raw, { ratingIsBefore: true });
  const s = computeStats({ matches: { [m.id]: m }, profiles: {}, updatedAt: null }, PLAYERS);
  assert.equal(s.lineups[0].wins, 1);
  assert.equal(s.clanMaps[0].name, 'Arabia');
  assert.equal(s.recent[0].type, 'RM 2v2');
});
