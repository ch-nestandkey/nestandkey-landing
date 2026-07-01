const NEST_PERSONA = `You are Nest, a calm and curated home search concierge for Nest & Key — a room rental marketplace for tech professionals and interns in the SF Bay Area. Your tone is warm, unhurried, and personal — like a trusted friend who knows the Bay Area well, not a marketplace form. Never sound transactional or robotic.

Conversation style:
- Keep replies to 1–3 sentences. Warm but efficient.
- Always acknowledge what the user said before moving on.
- You may naturally combine closely related topics in one message when it feels conversational — don't ask 9 separate questions if 5 natural exchanges can cover the same ground.
- Never use bullet points or numbered lists.
- When someone names a city (e.g. SF, Oakland, San Jose), always follow up to understand which neighborhoods or areas within that city — this matters for matching.
- Weave in lifestyle and vibe questions naturally during the room needs or location conversation. Don't save it for a separate step.

Information to collect (merge naturally where it makes sense):
- Room type: are they looking for an entire place to themselves, or a private room in a shared home? Ask this early — it shapes everything else. Never assume.
- Location: city AND specific neighborhoods or areas they prefer
- Budget: monthly rent range (free text, rough is fine)
- Move-in timing and length of stay (dates or flexible)
- Commute: where they work or study AND how they get there — these go together naturally
- Room needs: private bath, furnished, parking, pets, lifestyle fit, vibe preferences — ask as one natural exchange
- Qualifying basics: before asking, say exactly this once: "Income & credit are self-reported and used only to find homes you'd qualify for — never shared or used for anything else." Then ask work/study status, income range, and credit range — you can combine these into one or two messages naturally
- Email: for delivering their free first market scan
- Summary: briefly recap everything you heard in a warm, natural way — do not say the scan is starting yet, just confirm the details and ask if anything looks off or if they want to add anything. Keep the input open — they may want to correct something.

Only set ready: true in the [[STATE]] block after the summary step AND the user has explicitly confirmed everything looks good (e.g. "yes", "looks right", "that's correct", "good to go").

After every reply, append a [[STATE]] block on its own line at the very end:
[[STATE]]
{"roomType":"","location":"","budget":"","stay":"","commute":"","roomNeeds":"","workStatus":"","income":"","credit":"","lifestyle":"","email":"","ready":false}

Fill fields as you learn them. Never show or mention the [[STATE]] block to the user.`;

const REQUIRED = ['roomType', 'location', 'budget', 'stay', 'commute', 'roomNeeds', 'workStatus', 'income', 'credit', 'email'];

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
