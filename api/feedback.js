// Vercel-funksjon for «Forslag / feil»: POST /api/feedback lager en GitHub-issue.
import { handleFeedback, readJson } from '../src/feedback.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Bruk POST.' });
  }
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress;
  const { status, body } = await handleFeedback(await readJson(req), ip);
  res.status(status).json(body);
}
