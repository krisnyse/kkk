// Servervedlikehold og nyeste patch for AoE2 DE.
// Brukes både av Vercel-funksjonen (api/server-news.js) og den lokale serveren.
//
// Kilder (begge offisielle og offentlige):
// - Vedlikehold: «News & Announcements» på forums.ageofempires.com (Discourse). World's Edge legger ut
//   «🛠️ Server Maintenance - Thursday, October 8 - I, II, III DE, and IV» der før hvert vedlikehold.
// - Patch: Steam-nyhetene for AoE2 DE (app 813780), bare utviklernes egne kunngjøringer.

const FORUM = 'https://forums.ageofempires.com';
const NEWS_CATEGORY = `${FORUM}/c/news-announcements/42.json`;
const STEAM_NEWS = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=813780&count=30&maxlength=0&feeds=steam_community_announcements&format=json';
const HEADERS = { 'User-Agent': 'kkk-dashboard (https://kkk-pearl-tau.vercel.app)', Accept: 'application/json' };
const DEFAULT_HOURS = 2; // brukes når innlegget ikke sier hvor lenge det varer
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} fra ${new URL(url).host}`);
  return res.json();
}

// Vedlikehold som gjelder AoE2 (titlene lister «I, II, III DE, and IV»), ikke Age of Mythology eller forumet
export function isAoe2Maintenance(title) {
  return /server maintenance/i.test(title) && /\bII\b/.test(title) && !/mythology/i.test(title);
}

// Dato fra tittelen («Thursday, October 8»), med år fra når innlegget ble skrevet
function dateFromTitle(title, createdAt) {
  const m = title.match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2})`, 'i'));
  if (!m) return null;
  const created = new Date(createdAt);
  const month = MONTHS.indexOf(m[1].toLowerCase());
  let year = created.getUTCFullYear();
  if (month < created.getUTCMonth() - 6) year += 1; // skrevet i desember om januar
  return Date.UTC(year, month, Number(m[2]));
}

// Leser start (og slutt) fra første innlegg. Discourse-datoer ligger som data-date/data-time eller ISO-tekst.
export function parseMaintenance(topic, cooked = '') {
  const times = [];
  for (const m of cooked.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"(?:[^>]*?data-time="(\d{2}:\d{2}(?::\d{2})?)")?(?:[^>]*?data-timezone="([^"]+)")?/g)) {
    // Kunngjøringene bruker UTC; andre tidssoner hopper vi over heller enn å gjette feil
    if (m[2] && (!m[3] || /^(UTC|Etc\/UTC|GMT)$/i.test(m[3]))) times.push(Date.parse(`${m[1]}T${m[2]}Z`));
  }
  if (!times.length) {
    for (const m of cooked.matchAll(/\b(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?Z\b/g)) times.push(Date.parse(`${m[1]}T${m[2]}Z`));
  }
  const text = cooked.replace(/<[^>]+>/g, ' ');
  // «1 to 2 hours» → 2. Største tall under 12 timer, så «1 hour before» ikke tar over.
  const hours = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*)?hours?/gi)]
    .map((m) => Number(m[2] ?? m[1])).filter((h) => h > 0 && h <= 12);
  const durationH = hours.length ? Math.max(...hours) : null;
  const start = times.find(Number.isFinite) ?? null;
  const later = times.find((t) => start && t > start && t - start <= 12 * 3600_000);
  const titleDay = start ? null : dateFromTitle(topic.title, topic.created_at);
  return {
    title: topic.title.replace(/^title:\s*/i, '').replace(/^[^\p{L}\p{N}]+/u, '').trim(),
    url: `${FORUM}/t/${topic.slug}/${topic.id}`,
    postedAt: topic.created_at,
    start: start ? new Date(start).toISOString() : null,
    end: start ? new Date(later ?? start + (durationH ?? DEFAULT_HOURS) * 3600_000).toISOString() : null,
    day: titleDay ? new Date(titleDay).toISOString().slice(0, 10) : null, // når klokkeslett mangler
    durationH,
  };
}

// Neste (eller pågående) vedlikehold, ellers forrige
export function pickMaintenance(items, now = Date.now()) {
  const endOf = (m) => (m.end ? Date.parse(m.end) : m.day ? Date.parse(`${m.day}T23:59:59Z`) : 0);
  const startOf = (m) => (m.start ? Date.parse(m.start) : m.day ? Date.parse(`${m.day}T00:00:00Z`) : 0);
  const upcoming = items.filter((m) => endOf(m) >= now).sort((a, b) => startOf(a) - startOf(b));
  if (upcoming.length) return { next: { ...upcoming[0], ongoing: startOf(upcoming[0]) <= now }, previous: null };
  const past = items.filter((m) => startOf(m)).sort((a, b) => startOf(b) - startOf(a));
  return { next: null, previous: past[0] ?? null };
}

// Steam-teksten er BBCode med litt HTML; gjør den om til ren tekst
export function stripMarkup(s) {
  return String(s ?? '')
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ')
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
    .replace(/\[(?:previewyoutube|video)[^\]]*\][\s\S]*?\[\/(?:previewyoutube|video)\]/gi, ' ')
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).replace(/[,.;:–-]+$/, '')} …`;
}

// Nyeste patch: utviklernes kunngjøring med «Update», «Patch» eller «Hotfix» i tittelen
export function pickPatch(newsitems) {
  const item = [...(newsitems ?? [])]
    .filter((n) => n.feedname === 'steam_community_announcements' && /\b(update|patch|hotfix)\b/i.test(n.title) && !/\b(maintenance|roadmap|preview|sale)\b/i.test(n.title))
    .sort((a, b) => b.date - a.date)[0];
  if (!item) return null;
  // Overskriftene i patch-notatene sier best hva den inneholdt
  const headings = [...String(item.contents).matchAll(/\[h[1-3]\]([\s\S]*?)\[\/h[1-3]\]/gi)]
    .map((m) => stripMarkup(m[1]))
    .filter((h) => h && h.length <= 60 && !/^(patch notes|known issues|contents|table of contents|feedback|bug fixes?)$/i.test(h));
  return {
    title: item.title,
    url: item.url,
    date: new Date(item.date * 1000).toISOString(),
    summary: shorten(stripMarkup(String(item.contents).replace(/\[h[1-6]\][\s\S]*?\[\/h[1-6]\]/gi, ' ')), 280),
    highlights: [...new Set(headings)].slice(0, 5),
  };
}

async function fetchMaintenance(now) {
  const { topic_list: list } = await getJson(NEWS_CATEGORY);
  const topics = (list?.topics ?? [])
    .filter((t) => isAoe2Maintenance(t.title))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 3);
  const items = await Promise.all(topics.map(async (t) => {
    const full = await getJson(`${FORUM}/t/${t.id}.json`).catch(() => null);
    return parseMaintenance(t, full?.post_stream?.posts?.[0]?.cooked);
  }));
  return pickMaintenance(items, now);
}

async function fetchPatch() {
  const { appnews } = await getJson(STEAM_NEWS);
  return pickPatch(appnews?.newsitems);
}

// Begge hentes hver for seg, så den ene kan vises selv om den andre feiler
export async function serverNews(now = Date.now()) {
  const [maintenance, patch] = await Promise.allSettled([fetchMaintenance(now), fetchPatch()]);
  return {
    fetchedAt: new Date(now).toISOString(),
    maintenance: maintenance.status === 'fulfilled' ? maintenance.value : { error: maintenance.reason?.message ?? 'feil' },
    patch: patch.status === 'fulfilled' ? patch.value : { error: patch.reason?.message ?? 'feil' },
    sources: { maintenance: `${FORUM}/c/news-announcements/42`, patch: 'https://store.steampowered.com/news/app/813780' },
  };
}

// Mellomlager i minnet: lokalt i en time, på Vercel tar CDN-cachen seg av resten
const CACHE_MS = 60 * 60_000;
let cached = null;
export async function cachedServerNews(now = Date.now()) {
  if (cached && now - cached.at < CACHE_MS) return cached.body;
  const body = await serverNews(now);
  if (!body.maintenance?.error && !body.patch?.error) cached = { at: now, body };
  return body;
}
