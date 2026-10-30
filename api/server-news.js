// Vercel-funksjon: GET /api/server-news gir neste servervedlikehold og nyeste patch for AoE2 DE.
import { serverNews } from '../src/servernews.js';

export default async function handler(req, res) {
  const body = await serverNews();
  const ok = !body.maintenance?.error && !body.patch?.error;
  // Vercels CDN mellomlagrer svaret i en time (kortere ved feil), så kildene får få kall
  res.setHeader('Cache-Control', ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=300');
  res.status(200).json(body);
}
