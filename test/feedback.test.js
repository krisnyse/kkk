import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssue, checkRateLimit, rateLimitMessage, resetRateLimit } from '../src/feedback.js';

const now = 1_000_000;
const valid = { type: 'feil', text: 'Kartet er feil på kampen i går', name: 'Paven', startedAt: now - 10_000, page: '#kamp=1' };

test('lager issue med tittel, etiketter og tekst', () => {
  const { issue } = buildIssue(valid, now);
  assert.equal(issue.title, '[Feil] Kartet er feil på kampen i går');
  assert.deepEqual(issue.labels, ['fra-siden', 'feil']);
  assert.match(issue.body, /^> Kartet er feil/);
  assert.match(issue.body, /\*\*Fra:\*\* Paven/);
  assert.match(issue.body, /#kamp=1/);
});

test('honningkrukke og for rask innsending regnes som spam', () => {
  assert.deepEqual(buildIssue({ ...valid, website: 'http://spam' }, now), { spam: true });
  assert.deepEqual(buildIssue({ ...valid, startedAt: now - 500 }, now), { spam: true });
});

test('avviser ugyldig type og for kort tekst', () => {
  assert.ok(buildIssue({ ...valid, type: 'annet' }, now).error);
  assert.ok(buildIssue({ ...valid, text: ' hei ' }, now).error);
  assert.ok(buildIssue(null, now).error);
});

test('@-omtaler varsler ikke folk på GitHub', () => {
  const { issue } = buildIssue({ ...valid, text: 'Spør @krisnyse om dette' }, now);
  assert.doesNotMatch(issue.body, /@krisnyse/);
  assert.doesNotMatch(issue.title, /@krisnyse/);
});

test('per IP: maks tre innsendinger per ti minutter', () => {
  resetRateLimit();
  for (let i = 0; i < 3; i++) assert.equal(checkRateLimit('1.2.3.4', now + i).ok, true);
  const blocked = checkRateLimit('1.2.3.4', now + 5);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.global, false);
  assert.ok(blocked.retryAfterMs > 9 * 60_000 && blocked.retryAfterMs <= 10 * 60_000);
  assert.equal(checkRateLimit('5.6.7.8', now + 5).ok, true);
  assert.equal(checkRateLimit('1.2.3.4', now + 10 * 60_000).ok, true);
});

test('per IP: maks ti innsendinger per døgn', () => {
  resetRateLimit();
  for (let i = 0; i < 10; i++) assert.equal(checkRateLimit('1.2.3.4', now + i * 11 * 60_000).ok, true);
  const blocked = checkRateLimit('1.2.3.4', now + 10 * 11 * 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 20 * 60 * 60_000);
});

test('global grense på tjue per time', () => {
  resetRateLimit();
  for (let i = 0; i < 20; i++) assert.equal(checkRateLimit(`10.0.0.${i}`, now + i).ok, true);
  const blocked = checkRateLimit('10.0.1.1', now + 30);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.global, true);
});

test('norsk feilmelding med ventetid', () => {
  assert.match(rateLimitMessage({ retryAfterMs: 7 * 60_000, global: false }), /om 7 minutter/);
  assert.match(rateLimitMessage({ retryAfterMs: 30_000, global: false }), /om ett minutt/);
  assert.match(rateLimitMessage({ retryAfterMs: 20 * 60 * 60_000, global: false }), /om 20 timer/);
  assert.match(rateLimitMessage({ retryAfterMs: 60_000, global: true }), /veldig mange/);
});
