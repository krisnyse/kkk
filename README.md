# KKK Håkky Dashboard

Statistikk-side for klanen vår i Age of Empires II: DE. Henter data fra Relic/World's Edge sitt community-API (det samme spillet bruker), lagrer kampene lokalt og viser:

- rating og W/L per spiller (lag-RM og 1v1-RM)
- lagrating over tid
- winrate per lagoppsett (to, tre eller alle fire av oss på samme lag)
- beste kart når vi spiller sammen
- mest spilte civer per spiller
- de siste kampene med civ og ratingendring
- Elo-banken: lag-RM-Elo vunnet og tapt per spiller
- winrate og Elo per lagstørrelse (2v2, 3v3, 4v4)
- lag-Elo fra før 13. juli 2022 regnet om til dagens skala (se under)
- erkefiender: motstandere vi har møtt oftest, taper mest mot og vinner mest mot (navnene slås opp én gang og lagres i `opponents` i `data/matches.json`)

## Kom i gang

Krever Node 22 eller nyere. Ingen avhengigheter å installere.

```sh
npm start          # http://localhost:3000
npm test
npm run collect    # hent nye kamper én gang
npm run build      # lag statisk side i dist/
```

Serveren henter nye data ved oppstart og deretter hvert 10. minutt. Kampene lagres i `data/matches.json`.

| Miljøvariabel  | Standard              | Hva                                   |
|----------------|-----------------------|---------------------------------------|
| `PORT`         | 3000                  | Port for nettsiden                    |
| `POLL_MINUTES` | 10                    | Hvor ofte nye kamper hentes           |
| `DATA_FILE`    | `data/matches.json`   | Hvor kampene lagres                   |
| `NO_POLL`      | –                     | Sett til `1` for å ikke hente data    |

Spillerne står i `src/config.js`. `profile_id` er tallet i aoe2insights-lenken.

## Publisert på Vercel

Vercel kjører ikke en server som står og går, så nettsiden der er statisk:

1. GitHub Actions (`.github/workflows/collect.yml`) kjører `npm run collect` hver halvtime og committer `data/matches.json` når det har kommet nye kamper.
2. Hver commit får Vercel til å kjøre `npm run build`, som lager `dist/` med nettsiden og ferdig utregnet `api/stats.json`.

Oppsett én gang: importer repoet i Vercel (Add New → Project → `krisnyse/kkk`). `vercel.json` sier resten. Jobben kan også kjøres for hånd under Actions → «Hent kamper» → Run workflow.

## Forslag og feilmeldinger

Knappen «Forslag / feil» øverst på siden sender til `api/feedback.js` (en Vercel-funksjon), som lager en GitHub-issue i repoet med etiketten `fra-siden` og `forslag` eller `feil`. Det krever miljøvariabelen `GITHUB_TOKEN` i Vercel: et fint-granulert token med tilgang bare til dette repoet og **Issues: Read and write**. Uten token svarer skjemaet at innsending ikke er satt opp. `FEEDBACK_REPO` kan settes for å bruke et annet repo enn `krisnyse/kkk`.

Spambeskyttelse: et skjult felt bots fyller ut, minst 3 sekunder fra skjemaet åpnes til det sendes, og maks 5 innsendinger per IP per time.

## Viktig å vite

- API-et er uoffisielt og udokumentert. Det kan endre seg uten varsel.
- API-et gir bare de siste kampene (ca. 10 per kamptype). Historikken bygges derfor opp mens serveren kjører, så la den gå hele tiden (for eksempel på en Raspberry Pi, Fly.io eller Railway).
- Civ-navn kommer fra `src/civs.js`. Når et nytt DLC kommer, legg til de nye civene der.
- Kamptyper som ikke er RM 1v1–4v4 eller egendefinerte, vises som «Annet (id)». Utvid `MATCH_TYPES` i `src/normalize.js` om dere vil ha bedre navn.

## Lag-Elo fra før juli 2022

13. juli 2022 gjorde utviklerne en engangsjustering av all lag-Elo (RM 2v2–4v4) for å få den på samme skala som 1v1, og samtidig begynte poengene å regnes ut fra hver spillers egen rating mot motstandernes snitt ([kunngjøringen](https://www.ageofempires.com/news/updates-to-ranked-team-game-elo-calculation/)). De fleste mistet 300–600 poeng over natta. 1v1 ble ikke endret.

Formelen ble aldri publisert, så `src/elo.js` bruker en lineær omregning estimert fra våre egne kamper: siste rating før og første etter omleggingen for de fem kontoene som spilte lagkamp under tre uker på hver side. Det gir **ny ≈ 0,49 × gammel + 417**, med under 10 poeng avvik for disse (1404–1639). Utenfor det området er den en ekstrapolering, og poengene per kamp før omleggingen ble regnet ut på en annen måte, så tallene er et anslag.

Omregningen gjøres når statistikken regnes ut (klan-Elo, ratinggrafer, Elo-banken, rekorder, vinnersjanser og kampsider). `data/matches.json` har fortsatt de ekte tallene. `node scripts/elo-fit.js` viser grunnlaget.

## Struktur

```
src/relic.js       kall mot Relic-API-et
src/normalize.js   gjør rådata om til enkle objekter
src/collector.js   henter og lagrer nye kamper
src/stats.js       regner ut statistikken
src/elo.js         omregning av lag-Elo fra før juli 2022
src/server.js      HTTP-server: /api/stats og nettsiden i public/
public/            nettsiden (ren HTML/JS, Chart.js fra CDN)
```
