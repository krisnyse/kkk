// Viser grunnlaget for omregningen i src/elo.js: siste lag-RM-rating før og første etter
// omleggingen 13. juli 2022 per konto, og en lineær tilpasning for kontoer med kort opphold.
// Bruk: node scripts/elo-fit.js [maks dager på hver side, standard 21]
import { readFileSync } from 'node:fs';
import { DATA_FILE } from '../src/config.js';
import { TEAM_ELO_RESET } from '../src/elo.js';

const maxDays = Number(process.argv[2] ?? 21);
const { matches } = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const { cutoff } = TEAM_ELO_RESET;

const last = new Map();
const pairs = [];
for (const m of Object.values(matches).filter((m) => [7, 8, 9].includes(m.matchType)).sort((a, b) => a.start - b.start)) {
  for (const p of m.players) {
    if (p.profileId < 0 || p.oldRating == null) continue;
    const l = last.get(p.profileId);
    if (l && l.t < cutoff && m.start >= cutoff) {
      const before = (cutoff - l.t) / 86400;
      const after = (m.start - cutoff) / 86400;
      if (before <= maxDays && after <= maxDays) pairs.push({ profileId: p.profileId, before: l.rating, after: p.oldRating });
    }
    last.set(p.profileId, { t: m.start, rating: p.newRating });
  }
}

const n = pairs.length;
if (n < 2) {
  console.log(`For få kontoer (${n}) med under ${maxDays} dager på hver side.`);
  process.exit(0);
}
const mx = pairs.reduce((s, p) => s + p.before, 0) / n;
const my = pairs.reduce((s, p) => s + p.after, 0) / n;
const b = pairs.reduce((s, p) => s + (p.before - mx) * (p.after - my), 0) / pairs.reduce((s, p) => s + (p.before - mx) ** 2, 0);
const a = my - b * mx;
for (const p of pairs) console.log(`${p.profileId}\t${p.before} → ${p.after}\t(modell ${Math.round(a + b * p.before)})`);
console.log(`\n${n} kontoer: ny ≈ ${b.toFixed(3)} × gammel + ${a.toFixed(1)}`);
