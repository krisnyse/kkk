// Vercel-funksjon: GET /api/live gir kamper som pågår nå for noen av oss («Spiller nå»).
import { PLAYERS } from '../src/config.js';
import { fetchLive } from '../src/live.js';

export default async function handler(req, res) {
  try {
    const body = await fetchLive(PLAYERS);
    // Vercels CDN svarer fra cache i ett minutt, så mange besøkende gir fortsatt få kall til aoe2companion
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    res.status(200).json(body);
  } catch (err) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(502).json({ error: err.message });
  }
}
