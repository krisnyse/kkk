// Henter nye kamper én gang og lagrer dem. Brukes av GitHub Actions-jobben.
import { PLAYERS, DATA_FILE } from '../src/config.js';
import { loadStore } from '../src/store.js';
import { collect } from '../src/collector.js';
import { allProfileIds } from '../src/accounts.js';

const store = await loadStore(DATA_FILE);
const added = await collect(store, allProfileIds(PLAYERS), DATA_FILE);
console.log(`${added} nye kamper (totalt ${Object.keys(store.matches).length})`);
