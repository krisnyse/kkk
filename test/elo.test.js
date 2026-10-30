import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_ELO_RESET, adjustTeamRating, normalizeTeamElo } from '../src/elo.js';
import { computeStats } from '../src/stats.js';
import { matchDetail } from '../src/extras.js';
import { PLAYERS } from '../src/config.js';

const before = TEAM_ELO_RESET.cutoff - 86400;
const after = TEAM_ELO_RESET.cutoff + 86400;
const match = (id, matchType, start, onklg, enemy) => ({
  id, matchType, start, end: start + 1800, mapFile: 'Arabia',
  players: [
    { profileId: 387309, civId: 1, team: 1, won: true, oldRating: onklg[0], newRating: onklg[1] },
    { profileId: 999, civId: 2, team: 2, won: false, oldRating: enemy[0], newRating: enemy[1] },
  ],
});

test('omregningen treffer ratingene vi så rundt omleggingen i juli 2022', () => {
  // Siste rating før → første rating etter, fra data/matches.json
  for (const [old, now] of [[1404, 1103], [1575, 1184], [1582, 1198], [1604, 1210], [1639, 1213]]) {
    assert.ok(Math.abs(adjustTeamRating(old) - now) <= 10, `${old} → ${adjustTeamRating(old)}, forventet ca. ${now}`);
  }
  assert.equal(adjustTeamRating(null), null);
});

test('bare lag-RM før omleggingen regnes om', () => {
  const matches = {
    1: match(1, 8, before, [1600, 1616], [1650, 1634]),
    2: match(2, 8, after, [1210, 1225], [1250, 1235]),
    3: match(3, 6, before, [1100, 1116], [1120, 1104]), // 1v1 ble ikke endret
  };
  const out = normalizeTeamElo(matches);
  assert.deepEqual(out[1].players.map((p) => [p.oldRating, p.newRating]), [[1201, 1209], [1226, 1218]]);
  assert.equal(out[2], matches[2]);
  assert.equal(out[3], matches[3]);
  assert.equal(matches[1].players[0].oldRating, 1600, 'lagret data endres ikke');
});

test('ratinggrafen og kampsiden får ingen kunstig knekk ved omleggingen', () => {
  const store = {
    matches: {
      1: match(1, 8, before, [1600, 1616], [1650, 1634]),
      2: match(2, 8, after, [1210, 1225], [1250, 1235]),
    },
    profiles: {},
    updatedAt: null,
  };
  const s = computeStats(store, PLAYERS, { now: (after + 3600) * 1000 });
  const history = s.players.find((p) => p.profileId === 387309).ratingHistory.map((h) => h.rating);
  assert.deepEqual(history, [1209, 1225]);
  assert.equal(s.eloReset.cutoff, TEAM_ELO_RESET.cutoff);
  assert.equal(matchDetail(store, PLAYERS, 1).eloAdjusted, true);
  assert.equal(matchDetail(store, PLAYERS, 2).eloAdjusted, false);
});
