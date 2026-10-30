# AGENTS.md

Kontekst for AI-agenter (GitHub Copilot, Code-agenten m.fl.) i dette prosjektet.

## Prosjekt

Statistikk-side for KKK-klanen i Age of Empires II: DE. Ren Node (ingen avhengigheter).

- `src/relic.js` – kall mot Relic/World's Edge community-API
- `src/collector.js` – henter nye kamper jevnlig og lagrer i `data/matches.json`
- `src/maps.js` – kartnavn fra `options` i Relic-API-et (`mapname` er ofte feil)
- `src/stats.js` – regner ut statistikken som `/api/stats` returnerer
- `src/server.js` – HTTP-server for API og `public/`
- `src/config.js` – klanmedlemmer (profile_id) og innstillinger

## Kommandoer

```bash
npm start   # http://localhost:3000
npm test
```

## Regler

- Ingen nye avhengigheter uten god grunn; bruk innebygde Node-moduler.
- Tester med `node --test` i `test/`.
- Vær forsiktig med antall kall mot Relic-API-et (uoffisielt, udokumentert).
- Hver ny PR med endringer brukerne ser legger til en oppføring øverst i `public/changelog.json` (dato, PR-nummer, kort tittel og én–to setninger på norsk). Den vises under «Changelog» øverst til høyre på siden.
