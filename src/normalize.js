// Gjør om Relic-API-ets rådata til enklere objekter som er lette å lagre og regne på.

// leaderboard_id i GetPersonalStat
export const LEADERBOARDS = { 3: 'rm1v1', 4: 'rmTeam', 13: 'ew1v1', 14: 'ewTeam' };

// matchtype_id i kamphistorikken. Typer som ikke står her vises som «Annet».
export const MATCH_TYPES = {
  0: 'Egendefinert',
  6: 'RM 1v1',
  7: 'RM 2v2',
  8: 'RM 3v3',
  9: 'RM 4v4',
};

export function matchTypeName(id) {
  return MATCH_TYPES[id] ?? `Annet (${id})`;
}

// "Black_Forest.rms" -> "Black Forest"
export function mapName(file = '') {
  return file.replace(/\.rms2?$/i, '').replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Ukjent kart';
}

export function normalizeMatch(raw) {
  const members = new Map((raw.matchhistorymember ?? []).map((m) => [m.profile_id, m]));
  const reports = raw.matchhistoryreportresults ?? [];
  const base = reports.length ? reports : [...members.values()];

  const players = base.map((r) => {
    const m = members.get(r.profile_id) ?? {};
    const outcome = m.outcome ?? r.resulttype;
    return {
      profileId: r.profile_id,
      civId: r.civilization_id ?? m.civilization_id,
      team: r.teamid ?? m.teamid,
      won: outcome === 1,
      oldRating: m.oldrating ?? null,
      newRating: m.newrating ?? null,
    };
  });

  return {
    id: raw.id,
    mapFile: raw.mapname,
    matchType: raw.matchtype_id,
    start: raw.startgametime,
    end: raw.completiontime,
    players,
  };
}

export function normalizeProfiles(raw) {
  const groups = new Map();
  for (const g of raw.statGroups ?? []) {
    const p = g.members?.[0];
    if (p) groups.set(g.id ?? p.personal_statgroup_id, { profileId: p.profile_id, name: p.alias, country: p.country, ratings: {} });
  }
  for (const s of raw.leaderboardStats ?? []) {
    const key = LEADERBOARDS[s.leaderboard_id];
    const profile = groups.get(s.statgroup_id);
    if (key && profile) {
      profile.ratings[key] = { rating: s.rating, wins: s.wins, losses: s.losses, streak: s.streak };
    }
  }
  return Object.fromEntries([...groups.values()].map((p) => [p.profileId, p]));
}
