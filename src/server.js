import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PLAYERS, PORT, POLL_MINUTES, DATA_FILE } from './config.js';
import { loadStore } from './store.js';
import { collect } from './collector.js';
import { computeStats } from './stats.js';
import { matchDetail } from './extras.js';
import { periodStart } from './periods.js';
import { allProfileIds, mergeAccounts } from './accounts.js';
import { handleFeedback, readJson } from './feedback.js';
import { cachedLive } from './live.js';
import { cachedServerNews } from './servernews.js';

const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const store = await loadStore(DATA_FILE);
const ids = allProfileIds(PLAYERS);
let fetchedAt = store.updatedAt;

async function poll() {
  try {
    const added = await collect(store, ids, DATA_FILE);
    fetchedAt = new Date().toISOString();
    console.log(`[${new Date().toISOString()}] Hentet data, ${added} nye kamper (totalt ${Object.keys(store.matches).length})`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Klarte ikke å hente data:`, err.message);
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  // Samme filnavn som den statiske versjonen: /api/stats.json og /api/stats-<periode>.json
  const api = pathname.match(/^\/api\/stats(?:-(\w+))?(?:\.json)?$/);
  if (api) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(computeStats(mergeAccounts(store, PLAYERS), PLAYERS, { since: periodStart(api[1]), fetchedAt })));
  }

  const match = pathname.match(/^\/api\/match\/(\d+)(?:\.json)?$/);
  if (match) {
    const detail = matchDetail(mergeAccounts(store, PLAYERS), PLAYERS, match[1]);
    res.writeHead(detail ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(detail));
  }

  if (pathname === '/api/feedback' && req.method === 'POST') {
    const { status, body } = await handleFeedback(await readJson(req), req.socket.remoteAddress);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(body));
  }

  if (pathname === '/api/live') {
    const body = await cachedLive(PLAYERS).catch((err) => ({ error: err.message }));
    res.writeHead(body.error ? 502 : 200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(body));
  if (pathname === '/api/server-news') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(await cachedServerNews()));
  }

  if (pathname === '/periods.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end(await readFile(new URL('./periods.js', import.meta.url)));
  }

  const file = normalize(join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Ikke funnet');
  }
});

server.listen(PORT, () => console.log(`KKK-dashboard kjører på http://localhost:${PORT}`));

if (process.env.NO_POLL !== '1') {
  await poll();
  setInterval(poll, POLL_MINUTES * 60_000);
}
