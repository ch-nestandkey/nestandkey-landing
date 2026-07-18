// Server-side bridge to nest-key-app's create-listing endpoint. Done server-side
// (not a direct browser fetch from landlords.html) specifically to avoid needing
// CORS on nest-key-app's API -- server-to-server requests aren't subject to it.
const NEST_KEY_APP_URL = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const state = req.body || {};
  if (!state.email) {
    return res.status(400).json({ error: 'missing landlord email' });
  }

  try {
    const response = await fetch(`${NEST_KEY_APP_URL}/api/create-listing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('create-listing upstream error:', err);
      return res.status(502).json({ error: 'could not create listing' });
    }

    const { id } = await response.json();
    const applyUrl = `${NEST_KEY_APP_URL}/apply.html?listing=${id}`;

    return res.status(200).json({ id, applyUrl });
  } catch (err) {
    console.error('submit-listing handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
