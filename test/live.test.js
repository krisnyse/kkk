import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveMatches } from '../src/live.js';

const players = [
  { profileId: 1, name: 'OnklG', otherAccounts: [11] },
  { profileId: 2, name: 'DataPaven' },
];
const now = Date.parse('2026-10-30T21:00:00Z');
const match = (id, started, finished, teams) => ({ matchId: id, started, finished, mapName: 'Arabia', leaderboardName: 'Team Random Map', teams });

test('viser pågående kamper med oss, også fra andre kontoer', () => {
  const live = liveMatches([
    match(10, '2026-10-30T20:40:00Z', null, [
      { teamId: 1, players: [{ profileId: 11, name: 'Maxi Glasset', civName: 'Franks', rating: 1200 }, { profileId: 2, name: 'DataPaven', civName: 'Britons', rating: 1150 }] },
      { teamId: 2, players: [{ profileId: 90, name: 'Fiende', rating: 1180 }, { profileId: 91, name: 'Fiende2', rating: 1220 }] },
    ]),
    match(9, '2026-10-30T19:00:00Z', '2026-10-30T19:40:00Z', [{ players: [{ profileId: 1 }] }]),
  ], players, now);
  assert.equal(live.length, 1);
  assert.equal(live[0].id, 10);
  assert.equal(live[0].map, 'Arabia');
  assert.deepEqual(live[0].ours.map((p) => [p.profileId, p.name, p.civ]), [[1, 'OnklG', 'Franks'], [2, 'DataPaven', 'Britons']]);
  assert.deepEqual(live[0].theirs.map((p) => p.rating), [1180, 1220]);
});

test('hopper over gamle «pågående» kamper og kamper uten oss', () => {
  assert.deepEqual(liveMatches([
    match(1, '2026-10-30T16:00:00Z', null, [{ players: [{ profileId: 1 }] }]),
    match(2, '2026-10-30T20:50:00Z', null, [{ players: [{ profileId: 99 }] }]),
  ], players, now), []);
  assert.deepEqual(liveMatches(undefined, players, now), []);
});
