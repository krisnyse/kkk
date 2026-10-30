import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssue, rateLimited } from '../src/feedback.js';

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

test('rate limit etter fem innsendinger per time', () => {
  for (let i = 0; i < 5; i++) assert.equal(rateLimited('1.2.3.4', now + i), false);
  assert.equal(rateLimited('1.2.3.4', now + 6), true);
  assert.equal(rateLimited('5.6.7.8', now + 6), false);
  assert.equal(rateLimited('1.2.3.4', now + 61 * 60_000), false);
});
