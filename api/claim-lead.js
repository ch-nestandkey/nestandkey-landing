// Server-side bridge to nest-key-app's claim-lead endpoint. Same reasoning as
// submit-listing.js: server-to-server avoids the cross-repo CORS/Deployment
// Protection issue a direct browser fetch would hit.
const NEST_KEY_APP_URL = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { leadId, email } = req.body || {};
  if (!leadId || !email) {
    return res.status(400).json({ error: 'missing leadId or email' });
  }

  try {
    const response = await fetch(`${NEST_KEY_APP_URL}/api/claim-lead`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId, email }),
    });

    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (err) {
    console.error('claim-lead handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
