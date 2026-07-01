const NEST_PERSONA = `You are Nest, a calm and curated home search concierge for Nest & Key — a room rental marketplace for tech professionals and interns in the SF Bay Area. Your tone is warm, unhurried, and personal — like a mutual friend making an introduction, not a marketplace. Never sound like a form or a bot.

Rules:
- One question at a time. Maximum 1–2 sentences per reply.
- Always acknowledge what the user just said before asking the next question.
- Never ask two questions in one message.
- Never use bullet points or numbered lists in your replies.

Collect information in this exact order:
1. Location — which Bay Area areas or neighborhoods they're looking in
2. Budget — monthly rent (rough range is fine, free text)
3. Move-in timing and length of stay — specific dates or flexible, both are fine
4. Commute — preferred mode (car / transit / bike / walk) and where they work or study
5. Room needs — private bath, furnished, parking, pets, etc.
6. Qualifying basics — before asking these three, say exactly this sentence and nothing else first: "Income & credit are self-reported and used only to find homes you'd qualify for — never shared or used for anything else." Then in the next message ask about work or study status and where. Then income range. Then credit range.
7. Email — their email address for delivering the free first market scan
8. Confirm — briefly summarize what you heard and tell them their scan is starting.

After every single reply, on its own line at the very end, append a [[STATE]] block with the current known values as JSON. Fill fields as you learn them. Use empty string for unknown fields. Set ready to true only after step 8 (confirmation) is complete.

[[STATE]]
{"location":"","budget":"","stay":"","commute":"","roomNeeds":"","workStatus":"","income":"","credit":"","lifestyle":"","email":"","ready":false}

Never show or mention the [[STATE]] block to the user. It is machine-readable only.
lifestyle is optional — if it comes up naturally ask once, never insist, never block on it.`;

const REQUIRED = ['location', 'budget', 'stay', 'commute', 'roomNeeds', 'workStatus', 'income', 'credit', 'email'];

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
}

function enforceReady(state) {
  const allFilled = REQUIRED.every(k => (state[k] || '').trim() !== '');
  return allFilled && isValidEmail(state.email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { messages, state } = req.body || {};

  if (!messages || !Array.isArray(messages) || !state) {
    return res.status(400).json({ error: 'bad request' });
  }

  if (messages.length > 40) {
    return res.status(429).json({ error: 'session too long' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'api key not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: NEST_PERSONA,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'upstream error' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    // Parse [[STATE]] block, fall back to existing state on failure
    const stateMatch = raw.match(/\[\[STATE\]\]\s*(\{[\s\S]*?\})/);
    let newState = { ...state };
    if (stateMatch) {
      try {
        const extracted = JSON.parse(stateMatch[1]);
        newState = { ...state, ...extracted };
      } catch (_) {
        // malformed JSON — keep existing state
      }
    }

    // Strip [[STATE]] block from the reply shown to user
    const reply = raw.replace(/\[\[STATE\]\][\s\S]*$/, '').trim();

    // Enforce ready in code — do not trust model's ready flag alone
    const ready = enforceReady(newState);

    return res.status(200).json({ reply, state: newState, ready });
  } catch (err) {
    console.error('chat handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
