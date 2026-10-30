// «Forslag / feil» fra siden: lager en GitHub-issue i repoet.
// Brukes både av Vercel-funksjonen (api/feedback.js) og den lokale serveren.
// Krever GITHUB_TOKEN (fint-granulert token med Issues: Read and write på repoet).

const DEFAULT_REPO = 'krisnyse/kkk';
const TYPES = { forslag: 'Forslag', feil: 'Feil' };
const MAX_TEXT = 4000;
const MAX_NAME = 60;
const MIN_FILL_MS = 3000; // raskere enn dette er nesten alltid en bot
const RATE_LIMIT = 5; // innsendinger per IP per time
const RATE_WINDOW_MS = 60 * 60_000;

// Teller per IP. Ligger i minnet, så på Vercel gjelder den per instans – godt nok mot enkel spam.
const hits = new Map();

export function rateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
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
  if (rateLimited(ip || 'ukjent')) return { status: 429, body: { error: 'Du har sendt mange på kort tid. Prøv igjen om en time.' } };
  try {
    await createIssue(issue);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    console.error('Klarte ikke å lage issue:', err.message);
    return { status: 502, body: { error: 'Klarte ikke å sende. Prøv igjen senere.' } };
  }
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
