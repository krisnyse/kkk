# KKK Håkky Dashboard

Statistikk-side for klanen vår i Age of Empires II: DE. Henter data fra Relic/World's Edge sitt community-API (det samme spillet bruker), lagrer kampene lokalt og viser:

- rating og W/L per spiller (lag-RM og 1v1-RM)
- lagrating over tid
- winrate per lagoppsett (to, tre eller alle fire av oss på samme lag)
- beste kart når vi spiller sammen
- mest spilte civer per spiller
- de siste kampene med civ og ratingendring

## Kom i gang

Krever Node 22 eller nyere. Ingen avhengigheter å installere.

```sh
npm start          # http://localhost:3000
npm test
```

Serveren henter nye data ved oppstart og deretter hvert 10. minutt. Kampene lagres i `data/matches.json`.

| Miljøvariabel  | Standard              | Hva                                   |
|----------------|-----------------------|---------------------------------------|
| `PORT`         | 3000                  | Port for nettsiden                    |
| `POLL_MINUTES` | 10                    | Hvor ofte nye kamper hentes           |
| `DATA_FILE`    | `data/matches.json`   | Hvor kampene lagres                   |
| `NO_POLL`      | –                     | Sett til `1` for å ikke hente data    |

Spillerne står i `src/config.js`. `profile_id` er tallet i aoe2insights-lenken.

## Viktig å vite

- API-et er uoffisielt og udokumentert. Det kan endre seg uten varsel.
- API-et gir bare de siste kampene (ca. 10 per kamptype). Historikken bygges derfor opp mens serveren kjører, så la den gå hele tiden (for eksempel på en Raspberry Pi, Fly.io eller Railway).
- Civ-navn kommer fra `src/civs.js`. Når et nytt DLC kommer, legg til de nye civene der.
- Kamptyper som ikke er RM 1v1–4v4 eller egendefinerte, vises som «Annet (id)». Utvid `MATCH_TYPES` i `src/normalize.js` om dere vil ha bedre navn.

## Struktur

```
src/relic.js       kall mot Relic-API-et
src/normalize.js   gjør rådata om til enkle objekter
src/collector.js   henter og lagrer nye kamper
src/stats.js       regner ut statistikken
src/server.js      HTTP-server: /api/stats og nettsiden i public/
public/            nettsiden (ren HTML/JS, Chart.js fra CDN)
```
