// Klanmedlemmene. profile_id er det samme tallet som står i aoe2insights-lenken.
export const PLAYERS = [
  { profileId: 387309, name: 'OnklG' },
  { profileId: 385760, name: 'DataPaven' },
  { profileId: 384880, name: 'Tom Lobby' },
  { profileId: 384303, name: 'Kåre Gullballen' },
];

export const PORT = Number(process.env.PORT ?? 3000);
export const POLL_MINUTES = Number(process.env.POLL_MINUTES ?? 10);
export const DATA_FILE = process.env.DATA_FILE ?? new URL('../data/matches.json', import.meta.url).pathname;
