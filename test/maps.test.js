import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { mapFromOptions, parseOptions } from '../src/maps.js';
import { normalizeMatch } from '../src/normalize.js';

// Ekte `options` fra kamp 517029858: `mapname` sa Team_Islands.rms, men kartet var Nomad.
const NOMAD = 'eNpFU8FugzAM/Zd+ARSIdumBKnTKJCelC624jk1oYSuVpgqar58TJyknK7bfe7Yfm/elrfHbgp5tvWDEawZjeDO3+96FvFkwv6aYx/fpoQws1NewD+orpb1VexfxflGmblwo9cSgprzStzv1tEye/txbjlz8VBzkcPg8tpfzuddvAJdKwuWl1Nef4qgzTjjzQtzdqsyQBZ5M/ZaeR+mefbVBh6v1+SmPOhRP+VxxnIn6mbQD4dv41m2VEaTddLFnKw3O5vlHBkaE2d1so8uvgJjApwWovgI7x/pMfWdhh6P1MXEXyjSBZ2Qy8Cg955QfcIfNgbQ1DHTtY9CCSU0zgQYGbef5JZ8LqHuK8WZgulDTs6BpxRlLwm5KxBaELRw23jZipns93EykW+DO+7BTgbcXpMUAk6Z+JRzUokUe6jOsifV5nAMM7jvsFszAgDxYoPZyP/ra0vUFfut3TrvI1XUKd05+szhPvHMVb6b0EH1cPPu71C/RryFfeT8TfpHydkw+eeIPVfKZ+0+Cn/2/4fPjI/lMu/7dbvMP8MQC2g==';

// Lager `options` på samme format som Relic-API-et
function encode(entries) {
  const parts = entries.map(([k, v]) => {
    const s = Buffer.from(`${k}:${v}`);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(s.length);
    return Buffer.concat([len, s]);
  });
  const inner = Buffer.concat([Buffer.from([entries.length]), ...parts]).toString('base64');
  return zlib.deflateSync(JSON.stringify(inner)).toString('base64');
}

test('leser innstillingene i options', () => {
  const o = parseOptions(NOMAD);
  assert.equal(o['10'], '10901');
  assert.equal(o['97'], '2');
});

test('kartet hentes fra options, ikke mapname', () => {
  assert.equal(mapFromOptions(NOMAD), 'Nomad');
  const m = normalizeMatch({ id: 517029858, mapname: 'Team_Islands.rms', options: NOMAD, matchhistorymember: [] });
  assert.equal(m.mapFile, 'Nomad');
});

test('eldre kamper har kartet i nøkkel 11', () => {
  assert.equal(mapFromOptions(encode([[5, 5], [10, 0], [11, 10924]])), 'MegaRandom');
});

test('faller tilbake til mapname når options mangler eller kartet er ukjent', () => {
  assert.equal(mapFromOptions(undefined), null);
  assert.equal(mapFromOptions('ikke gyldig'), null);
  const m = normalizeMatch({ id: 1, mapname: 'my map', options: encode([[10, 999999], [97, 2]]), matchhistorymember: [] });
  assert.equal(m.mapFile, 'my map');
});
