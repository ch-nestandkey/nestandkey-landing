// Server-side bridge to nest-key-app's extract-lead-facts endpoint. Same
// reasoning as submit-listing.js / lead-info.js. Forwards the shared-secret
// header through untouched.
const NEST_KEY_APP_URL = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const response = await fetch(`${NEST_KEY_APP_URL}/api/extract-lead-facts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nk-secret': req.headers['x-nk-secret'] || '',
      },
      body: JSON.stringify(req.body || {}),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('extract-lead-facts upstream error:', err);
      return res.status(response.status === 401 ? 401 : 502).json({ error: 'could not extract facts' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('extract-lead-facts bridge handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
