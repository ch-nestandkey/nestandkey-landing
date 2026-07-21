// Server-side bridge to nest-key-app's lead-summary endpoint. Done
// server-side (not a direct browser fetch from landlords.html) for the same
// reason submit-listing.js is: server-to-server requests aren't subject to
// CORS, and this also avoids relying on nest-key-app's Deployment Protection
// being disabled for direct browser calls.
const NEST_KEY_APP_URL = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { lead } = req.query || {};
  if (!lead) {
    return res.status(400).json({ error: 'missing lead' });
  }

  try {
    const response = await fetch(`${NEST_KEY_APP_URL}/api/lead-summary?lead=${encodeURIComponent(lead)}`);

    if (!response.ok) {
      const err = await response.text();
      console.error('lead-summary upstream error:', err);
      return res.status(response.status === 404 ? 404 : 502).json({ error: 'could not fetch lead' });
    }

    const summary = await response.json();
    return res.status(200).json(summary);
  } catch (err) {
    console.error('lead-info handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
