import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAoe2Maintenance, parseMaintenance, pickMaintenance, pickPatch, stripMarkup } from '../src/servernews.js';

const topic = { id: 289231, slug: 'server-maintenance-thursday-september-3-i-ii-iii-de-and-iv', title: '🛠️ Server Maintenance - Thursday, September 3 - I, II, III DE, and IV', created_at: '2026-09-02T23:14:40.000Z' };
const cooked = '<p><strong>WHEN:</strong> <span data-date="2026-09-03" data-time="22:00:00" class="discourse-local-date" data-timezone="UTC">2026-09-03T22:00:00Z</span> (UTC)</p><p>Online matchmaking will be disabled exactly 1 hour before the maintenance window.</p><p><strong>DURATION:</strong> 1 to 2 hours</p>';

test('kjenner igjen AoE2-vedlikehold, ikke Age of Mythology eller forumet', () => {
  assert.ok(isAoe2Maintenance(topic.title));
  assert.ok(isAoe2Maintenance('Emergency Server Maintenance - May 1 - I, II, III, and IV'));
  assert.ok(!isAoe2Maintenance('🛠️ Server Maintenance - Wednesday, October 7 - Age of Mythology: Retold'));
  assert.ok(!isAoe2Maintenance('🛠 Forum Maintenance: Monday, September 22'));
});

test('leser start og varighet fra innlegget', () => {
  const m = parseMaintenance(topic, cooked);
  assert.equal(m.title, 'Server Maintenance - Thursday, September 3 - I, II, III DE, and IV');
  assert.equal(m.start, '2026-09-03T22:00:00.000Z');
  assert.equal(m.end, '2026-09-04T00:00:00.000Z');
  assert.equal(m.url, 'https://forums.ageofempires.com/t/server-maintenance-thursday-september-3-i-ii-iii-de-and-iv/289231');
});

test('ISO-tekst uten Discourse-dato, og dato fra tittelen når innlegget mangler', () => {
  assert.equal(parseMaintenance(topic, '<p>WHEN: 2026-09-03T22:00:00Z</p>').start, '2026-09-03T22:00:00.000Z');
  const m = parseMaintenance({ ...topic, title: 'Server Maintenance - Monday, January 4 - I, II, III DE, and IV', created_at: '2026-12-30T10:00:00Z' });
  assert.equal(m.start, null);
  assert.equal(m.day, '2027-01-04');
});

test('velger neste vedlikehold, ellers forrige', () => {
  const past = parseMaintenance(topic, cooked);
  const next = { ...past, start: '2026-11-05T22:00:00.000Z', end: '2026-11-06T00:00:00.000Z' };
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.deepEqual(pickMaintenance([past, next], now), { next: { ...next, ongoing: false }, previous: null });
  assert.equal(pickMaintenance([next], Date.parse('2026-11-05T23:00:00Z')).next.ongoing, true);
  assert.deepEqual(pickMaintenance([past], now), { next: null, previous: past });
});

test('nyeste patch fra Steam med overskrifter og kort tekst', () => {
  const p = pickPatch([
    { feedname: 'steam_community_announcements', title: 'Weekend sale', date: 1790000000, url: 'u0', contents: '' },
    { feedname: 'steam_community_announcements', title: 'Age of Empires II: DE — Update 160000', date: 1780000000, url: 'u1', contents: '[h2]Gammel[/h2]' },
    { feedname: 'steam_community_announcements', title: 'Age of Empires II: DE — Update 170000', date: 1785000000, url: 'u2',
      contents: '{STEAM_CLAN_IMAGE}/1/a.png [h1]Patch Notes[/h1] Greetings, Age of Empires fans! [b]This update[/b] brings balance changes. [h2]Ranked Map Pool[/h2] [h2]Civilization Balance[/h2] [list][*]Franks cheaper[/list] [url=https://x.y]link[/url]' },
    { feedname: 'pcgamer', title: 'Update review', date: 1789000000, url: 'u3', contents: '' },
  ]);
  assert.equal(p.title, 'Age of Empires II: DE — Update 170000');
  assert.equal(p.date, new Date(1785000000 * 1000).toISOString());
  assert.deepEqual(p.highlights, ['Ranked Map Pool', 'Civilization Balance']);
  assert.match(p.summary, /^Greetings, Age of Empires fans! This update brings balance changes/);
  assert.equal(pickPatch([]), null);
});

test('fjerner BBCode og HTML', () => {
  assert.equal(stripMarkup('[b]Hei[/b] <i>du</i> &amp; [url=https://a.b]lenke[/url]'), 'Hei du & lenke');
});
