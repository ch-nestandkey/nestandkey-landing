// Server-side bridge to nest-key-app's create-lead endpoint (same reasoning
// as submit-listing.js and lead-info.js: avoids CORS/Deployment Protection
// issues with direct browser calls). Forwards the shared-secret header
// through untouched -- the actual gate lives in nest-key-app's own
// requireToolSecret check, not here.
const NEST_KEY_APP_URL = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const response = await fetch(`${NEST_KEY_APP_URL}/api/create-lead`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nk-secret': req.headers['x-nk-secret'] || '',
      },
      body: JSON.stringify(req.body || {}),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('create-lead upstream error:', err);
      return res.status(response.status === 401 ? 401 : 502).json({ error: 'could not create lead' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('generate-outreach-link handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
