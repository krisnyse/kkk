// Klanmedlemmene. profile_id er det samme tallet som står i aoe2insights-lenken; nick er kallenavnet i klanen.
// Rekkefølgen bestemmer fargen (series-1 til -4), også på figurene i logoen.
// otherAccounts: andre kontoer spilleren har brukt; kampene der telles som spilleren (se accounts.js).
export const PLAYERS = [
  { profileId: 387309, name: 'OnklG', nick: 'OnklG', otherAccounts: [6901868, 12220518] }, // Maxi Glasset, MrDocken
  { profileId: 385760, name: 'DataPaven', nick: 'Paven', otherAccounts: [6903806] }, // Boyar_Zajic
  { profileId: 384880, name: 'Tom Lobby', nick: 'Sjefen', otherAccounts: [5356257, 6903748, 12220519] }, // Lom Tobby, Huscarl I Hagen, Suge Abrahamson
  { profileId: 384303, name: 'Kåre Gullballen', nick: 'Ferdi', otherAccounts: [6903777] }, // Shotel California
];

export const PORT = Number(process.env.PORT ?? 3000);
export const POLL_MINUTES = Number(process.env.POLL_MINUTES ?? 10);
export const DATA_FILE = process.env.DATA_FILE ?? new URL('../data/matches.json', import.meta.url).pathname;
