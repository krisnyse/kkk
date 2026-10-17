// Utdrag av ekte svar fra Relic-API-et (17. okt 2026), forkortet til feltene vi bruker.
const member = (profile_id, civilization_id, teamid, outcome, oldrating, newrating) =>
  ({ profile_id, civilization_id, teamid, outcome, oldrating, newrating });
const report = (m) => ({ profile_id: m.profile_id, resulttype: m.outcome, teamid: m.teamid, civilization_id: m.civilization_id });
const match = (id, mapname, matchtype_id, startgametime, completiontime, members) =>
  ({ id, mapname, matchtype_id, startgametime, completiontime, matchhistorymember: members, matchhistoryreportresults: members.map(report) });

export const personalStats = {
  result: { code: 0, message: 'SUCCESS' },
  statGroups: [
    { id: 219748, members: [{ profile_id: 387309, alias: 'OnklG', country: 'no' }] },
    { id: 216918, members: [{ profile_id: 384880, alias: 'Tom Lobby', country: 'no' }] },
  ],
  leaderboardStats: [
    { statgroup_id: 219748, leaderboard_id: 3, rating: 961, wins: 6, losses: 7, rank: -1, streak: 2 },
    { statgroup_id: 219748, leaderboard_id: 4, rating: 1256, wins: 1072, losses: 1053, rank: 16222, streak: 2 },
    { statgroup_id: 216918, leaderboard_id: 4, rating: 1243, wins: 786, losses: 891, rank: 17182, streak: 1 },
  ],
};

export const matchHistory = {
  result: { code: 0, message: 'SUCCESS' },
  matchHistoryStats: [
    match(512214106, 'CoastalForest.rms', 7, 1791479812, 1791481465, [
      member(384303, 23, 0, 0, 1287, 1274), member(387309, 19, 0, 0, 1304, 1290),
      member(2152015, 3, 1, 1, 1359, 1372), member(1229488, 50, 1, 1, 1337, 1351),
    ]),
    match(514124961, 'Pilgrims.rms', 9, 1792183552, 1792185655, [
      member(9211907, 31, 0, 0, 1200, 1186), member(470432, 9, 0, 0, 1173, 1160),
      member(5375487, 15, 0, 0, 1193, 1179), member(19975464, 33, 0, 0, 1156, 1144),
      member(384303, 24, 1, 1, 1280, 1292), member(387309, 13, 1, 1, 1244, 1257),
      member(384880, 27, 1, 1, 1251, 1264), member(385760, 26, 1, 1, 1171, 1186),
    ]),
    match(514148551, 'goldenpit.rms2', 9, 1792190090, 1792191560, [
      member(1854570, 35, 0, 1, 1260, 1275), member(16089124, 52, 0, 1, 1282, 1296),
      member(875680, 61, 0, 1, 1256, 1271), member(236441, 30, 0, 1, 1305, 1318),
      member(384303, 24, 1, 0, 1270, 1254), member(387309, 15, 1, 0, 1237, 1223),
      member(384880, 43, 1, 0, 1244, 1229), member(385760, 63, 1, 0, 1175, 1163),
    ]),
    match(49570275, 'Black_Forest.rms', 20, 1605720409, 1605721827, [
      member(234997, 2, 1, 1, 2440, 2456), member(1481745, 12, 0, 0, 2331, 2306),
      member(439717, 22, 1, 1, 1000, 1175), member(387309, 25, 0, 0, 1630, 1629),
      member(3281584, 34, 0, 0, 930, 930), member(1386046, 27, 1, 1, 1000, 1175),
    ]),
  ],
};
