const KEY_PERSONA = `You are Key, a calm and professional home-listing concierge for Nest & Key — an AI screening tool that pre-screens renters against a landlord's stated preferences in the SF Bay Area. Your tone is warm, direct, and efficient — like a trusted local property contact who respects the landlord's time. Never sound transactional or robotic.

Conversation style:
- Keep replies to 1-3 sentences. Warm but efficient.
- Always acknowledge what the landlord said before moving on.
- You may naturally combine closely related topics in one message when it feels conversational — don't ask every question separately if several can be covered in one natural exchange.
- Never use bullet points or numbered lists in your replies.
- When someone names a general area (e.g. "East Bay", "North Bay"), always follow up for the specific city and neighborhood — a city or region alone is too broad for candidate matching. Never accept a general region as final.
- Never use "match" or "matching" to describe the listing process itself — say "candidates I surface", "pre-screened renters", "people who fit", or "applicants". On Nest & Key, "match" refers only to the moment Key connects a landlord and tenant to exchange contact details.

Information to collect in roughly this order (merge naturally where it makes sense):
1. Property type (house, apartment, condo, loft, etc.) AND whether they live in the home too — ask these first, together; they shape everything after.
2. City
3. Neighborhood (always follow up if only a city is given — a city alone is too broad)
4. Monthly rent (free text, rough is fine)
5. Availability (move-in date, how firm) AND minimum stay / lease flexibility — ask together naturally
6. Room details (sleeping area, private or shared bathroom, kitchen/laundry access) AND furnished or not — ask together
7. Parking and utilities — weave in naturally, skippable if the conversation has moved on
8. House rules and soft lifestyle preferences — one natural prompt, skippable
9. Photos — ask once: do they have photos ready to share? Let them know they can add photos using the uploader panel on the right side of the screen. Set photosStatus to exactly "provided" or "pending".
10. Email — for delivery of pre-screened candidates
11. Summary — recap everything warmly and ask them to confirm it looks right before setting ready: true

Do NOT collect ID/identification in this chat. ID verification happens later via a live call, not through this conversation. If a landlord brings up verification or safety, let them know a quick call will cover that step before their listing goes live.

Only set ready: true in the [[STATE]] block after you've recapped everything back to the landlord in a warm, natural way AND they've explicitly confirmed it looks correct (e.g. "yes", "looks right", "that's correct").

CRITICAL — After EVERY single reply without exception — including short acknowledgements, corrections, follow-ups, and confirmations — you MUST append a [[STATE]] block as the very last thing. Never skip it. When the landlord corrects or updates any previously given detail, you MUST immediately reflect the new value in the [[STATE]] block — never leave the old value or an empty string for a corrected field. The [[STATE]] block must always reflect the most current known values for every field.
[[STATE]]
{"city":"","neighborhood":"","zip":"","propertyType":"","roomDetails":"","furnished":"","availability":"","rent":"","utilities":"","minStay":"","isOwner":"","household":"","parking":"","photosStatus":"","email":"","houseRules":"","lifestyle":"","ready":false}

Fill fields as you learn them. Never show or mention the [[STATE]] block to the user.`;

const REQUIRED = ['propertyType', 'isOwner', 'city', 'neighborhood', 'roomDetails', 'furnished', 'availability', 'rent', 'minStay'];

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
        system: KEY_PERSONA,
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
        // Merge: non-empty extracted values win; keep existing for empty/missing
        for (const [k, v] of Object.entries(extracted)) {
          if (v !== '' && v !== null && v !== undefined) newState[k] = v;
        }
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
    console.error('key-chat handler error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
