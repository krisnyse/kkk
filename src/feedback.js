// «Forslag / feil» fra siden: lager en GitHub-issue i repoet.
// Brukes både av Vercel-funksjonen (api/feedback.js) og den lokale serveren.
// Krever GITHUB_TOKEN (fint-granulert token med Issues: Read and write på repoet).

const DEFAULT_REPO = 'krisnyse/kkk';
const TYPES = { forslag: 'Forslag', feil: 'Feil' };
const MAX_TEXT = 4000;
const MAX_NAME = 60;
const MIN_FILL_MS = 3000; // raskere enn dette er nesten alltid en bot
// Grenser for innsending. Per IP: maks 3 per 10 min og 10 per døgn.
// Globalt: maks 20 per time totalt (sjekkes både i minnet og mot GitHub).
const IP_LIMITS = [
  { max: 3, windowMs: 10 * 60_000 },
  { max: 10, windowMs: 24 * 60 * 60_000 },
];
const GLOBAL_LIMIT = { max: 20, windowMs: 60 * 60_000 };
const LONGEST_WINDOW_MS = Math.max(GLOBAL_LIMIT.windowMs, ...IP_LIMITS.map((l) => l.windowMs));

// Tellere i minnet. På Vercel gjelder de per instans og nullstilles ved kald start,
// så den globale grensen sjekkes i tillegg mot faktiske issues på GitHub (se recentIssueCount).
const hits = new Map(); // ip -> [tidspunkt]
let globalHits = [];

// Hvor lenge (ms) til en ny innsending fra denne lista er lov, eller 0 hvis den er lov nå.
function waitFor(times, { max, windowMs }, now) {
  const recent = times.filter((t) => now - t < windowMs);
  return recent.length < max ? 0 : recent[recent.length - max] + windowMs - now;
}

// Sjekker grensene. Gir { ok: true } og registrerer innsendingen, eller { ok: false, retryAfterMs, global }.
export function checkRateLimit(ip, now = Date.now()) {
  const key = ip || 'ukjent';
  const times = (hits.get(key) ?? []).filter((t) => now - t < LONGEST_WINDOW_MS);
  globalHits = globalHits.filter((t) => now - t < GLOBAL_LIMIT.windowMs);
  const ipWait = Math.max(...IP_LIMITS.map((l) => waitFor(times, l, now)));
  if (ipWait > 0) return { ok: false, retryAfterMs: ipWait, global: false };
  const globalWait = waitFor(globalHits, GLOBAL_LIMIT, now);
  if (globalWait > 0) return { ok: false, retryAfterMs: globalWait, global: true };
  times.push(now);
  hits.set(key, times);
  globalHits.push(now);
  if (hits.size > 5000) pruneHits(now);
  return { ok: true };
}

function pruneHits(now) {
  for (const [ip, times] of hits) if (!times.some((t) => now - t < LONGEST_WINDOW_MS)) hits.delete(ip);
}

// Kun for tester
export function resetRateLimit() {
  hits.clear();
  globalHits = [];
}

// Norsk feilmelding med omtrentlig ventetid
export function rateLimitMessage({ retryAfterMs, global }) {
  const min = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  const wait = min >= 120 ? `${Math.ceil(min / 60)} timer` : min === 1 ? 'ett minutt' : `${min} minutter`;
  return global
    ? `Det har kommet inn veldig mange forslag og feilmeldinger akkurat nå. Prøv igjen om ${wait}.`
    : `Du har sendt mange på kort tid. Vent litt og prøv igjen om ${wait}.`;
}

// Sjekker skjemaet. Gir { error } eller { spam } eller { issue }.
export function buildIssue(input, now = Date.now()) {
  const body = input && typeof input === 'object' ? input : {};
  // Honningkrukke: feltet er skjult for folk, men bots fyller det ut
  if (body.website) return { spam: true };
  if (Number.isFinite(body.startedAt) && now - body.startedAt < MIN_FILL_MS) return { spam: true };

  const type = TYPES[body.type] ? body.type : null;
  if (!type) return { error: 'Velg forslag eller feil.' };
  const text = String(body.text ?? '').trim();
  if (text.length < 5) return { error: 'Skriv litt mer i beskrivelsen.' };
  if (text.length > MAX_TEXT) return { error: `Beskrivelsen kan være maks ${MAX_TEXT} tegn.` };
  const name = String(body.name ?? '').trim().slice(0, MAX_NAME);
  const page = String(body.page ?? '').slice(0, 300);

  const firstLine = text.split('\n')[0];
  const title = `[${TYPES[type]}] ${firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine}`;
  const meta = [`**Fra:** ${name ? noMention(name) : 'anonym'}`];
  if (page) meta.push(`**Side:** \`${page.replaceAll('`', '')}\``);
  const issueBody = `${quote(text)}\n\n${meta.join('  \n')}\n\n---\n_Sendt inn via «Forslag / feil» på siden._`;
  return { issue: { title: noMention(title), body: issueBody, labels: ['fra-siden', type] } };
}

// Hindrer at @navn i teksten varsler folk på GitHub
const noMention = (s) => s.replaceAll('@', '@​');
const quote = (s) => noMention(s).split('\n').map((l) => `> ${l}`).join('\n');

// Antall issues fra siden laget siste time, hentet fra GitHub. Gir null hvis det ikke lar seg sjekke.
export async function recentIssueCount({ token = process.env.GITHUB_TOKEN, repo = process.env.FEEDBACK_REPO || DEFAULT_REPO, now = Date.now() } = {}) {
  const since = new Date(now - GLOBAL_LIMIT.windowMs).toISOString();
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues?labels=fra-siden&state=all&since=${since}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kkk-dashboard', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) return null;
    const issues = await res.json();
    // «since» gjelder sist oppdatert, så vi teller bare de som faktisk ble laget i vinduet
    return issues.filter((i) => Date.parse(i.created_at) > now - GLOBAL_LIMIT.windowMs).length;
  } catch {
    return null;
  }
}

export async function createIssue(issue, { token = process.env.GITHUB_TOKEN, repo = process.env.FEEDBACK_REPO || DEFAULT_REPO } = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'kkk-dashboard',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(issue),
  });
  if (!res.ok) throw new Error(`GitHub svarte ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Felles håndtering av en innsending. Gir { status, body } som sendes tilbake som JSON.
export async function handleFeedback(input, ip) {
  if (!process.env.GITHUB_TOKEN) return { status: 503, body: { error: 'Innsending er ikke satt opp ennå.' } };
  const { error, spam, issue } = buildIssue(input);
  // Bots får «takk» så de ikke prøver på nytt
  if (spam) return { status: 200, body: { ok: true } };
  if (error) return { status: 400, body: { error } };
  const limit = checkRateLimit(ip);
  if (!limit.ok) return tooMany(limit);
  // Den globale grensen sjekkes også mot GitHub, siden tellerne i minnet ikke deles mellom Vercel-instanser.
  // Feiler sjekken, slipper vi innsendingen gjennom.
  const count = await recentIssueCount();
  if (count !== null && count >= GLOBAL_LIMIT.max) return tooMany({ retryAfterMs: 15 * 60_000, global: true });
  try {
    await createIssue(issue);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('Klarte ikke å lage issue:', err.message);
    return { status: 502, body: { error: 'Klarte ikke å sende. Prøv igjen senere.' } };
  }
}

function tooMany(limit) {
  const retryAfter = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
  return { status: 429, headers: { 'Retry-After': String(retryAfter) }, body: { error: rateLimitMessage(limit), retryAfter } };
}

// Leser JSON-body fra en vanlig Node-request (maks 16 kB)
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
