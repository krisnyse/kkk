// Vercel-funksjon for «Forslag / feil»: POST /api/feedback lager en GitHub-issue.
import { handleFeedback, readJson } from '../src/feedback.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Bruk POST.' });
  }
  // Vercel setter x-real-ip / x-forwarded-for selv, så klienten kan ikke forfalske dem
  const ip = String(req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress;
  const { status, headers, body } = await handleFeedback(await readJson(req), ip);
  for (const [k, v] of Object.entries(headers ?? {})) res.setHeader(k, v);
  res.status(status).json(body);
}
