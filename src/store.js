// Enkel JSON-fil som database. For 4 spillere holder dette i mange år;
// bytt til SQLite hvis det en gang blir for tregt.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function loadStore(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { matches: {}, profiles: {}, updatedAt: null };
  }
}

export async function saveStore(file, store) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(store));
  await rename(tmp, file);
}
