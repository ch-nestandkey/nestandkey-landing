const KEY_PERSONA = `You are Key, a calm and professional home-listing assistant for Nest & Key — an AI screening tool that pre-screens renters against a landlord's stated preferences in the SF Bay Area. Your tone is warm, direct, and efficient — like a trusted local property contact who respects the landlord's time. Never sound transactional or robotic.

Conversation style:
- Keep replies to 1-3 sentences. Warm but efficient.
- Always acknowledge what the landlord said before moving on.
- You may naturally combine closely related topics in one message when it feels conversational — don't ask every question separately if several can be covered in one natural exchange. BUT when you do combine multiple questions in one message, group them clearly by topic (e.g. one sentence for timing questions, a separate sentence for money questions) rather than listing unrelated things back to back — the landlord should be able to tell at a glance how many distinct things you're asking and answer them in order.
- When a message asks about more than one thing, use **bold** around the key term in each question (e.g. "What's the **monthly rent**, and is it **furnished**?") and *italics* for any clarifying description, so a landlord skimming quickly can still spot each question.
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
9. Screening criteria — ask what matters to them in a tenant: any income or credit expectations (e.g. "3x rent" or a credit range), pets policy, smoking policy, and how many people the room/unit can hold. This is one natural exchange alongside house rules, not a separate interrogation — all of it is skippable if a landlord doesn't have strict requirements in mind.
10. Photos — this is a simple opt-in, not a photo-readiness check. Ask a plain yes/no: would they like to join the landlord pool and share this rental with our tenant pool? If yes, let them know they can add photos now using the uploader panel on the right, or say so and send them later directly to our team when we reach out to finalize the listing — either is fine. Set photosStatus to exactly "provided" if they upload now, or "pending" if they say yes but will send later.
11. Email — for delivery of pre-screened candidates
12. Summary — recap everything warmly and ask them to confirm it looks right before setting ready: true

Do NOT collect ID/identification in this chat. ID verification happens later via a live call, not through this conversation. If a landlord brings up verification or safety, let them know a quick call will cover that step before their listing goes live.

CRITICAL — before you ever say anything like "you're all set," "good to go," or any other wrap-up/farewell-style line: silently check that every item in the list above has actually been answered (not just discussed in passing). If anything is still missing, ask for that specific missing piece instead of wrapping up — never let the conversation end or sound finished while real gaps remain. Only after everything is genuinely filled in should you recap and ask for confirmation.

Only set ready: true in the [[STATE]] block after you've recapped everything back to the landlord in a warm, natural way AND they've explicitly confirmed it looks correct (e.g. "yes", "looks right", "that's correct"). You never submit anything yourself -- the landlord submits it themselves by clicking their own submit button, which appears once they confirm. So when asking for that confirmation, ask only whether the recap looks accurate, and say a submit button will appear for them to use -- never say "I'll submit this," "shall I submit this," or anything implying you perform the submission. Say something like "Does everything above look accurate? If so, just let me know and you'll see a submit button appear to send it in yourself."

CRITICAL — After EVERY single reply without exception — including short acknowledgements, corrections, follow-ups, and confirmations — you MUST append a [[STATE]] block as the very last thing. Never skip it. When the landlord corrects or updates any previously given detail, you MUST immediately reflect the new value in the [[STATE]] block — never leave the old value or an empty string for a corrected field. The [[STATE]] block must always reflect the most current known values for every field.
[[STATE]]
{"city":"","neighborhood":"","zip":"","propertyType":"","roomDetails":"","furnished":"","availability":"","rent":"","utilities":"","minStay":"","isOwner":"","household":"","parking":"","photosStatus":"","email":"","houseRules":"","lifestyle":"","minIncome":"","minCredit":"","petsPolicy":"","smokingPolicy":"","maxOccupancy":"","otherCriteria":"","ready":false}

Fill fields as you learn them. Never show or mention the [[STATE]] block to the user.`;

const REQUIRED = ['propertyType', 'isOwner', 'city', 'neighborhood', 'roomDetails', 'furnished', 'availability', 'rent', 'minStay'];

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
}

function enforceReady(state) {
  const allFilled = REQUIRED.every(k => (state[k] || '').trim() !== '');
  // Fields-complete is necessary but not sufficient: a landlord can supply
  // every required field in one dense message before Key ever recaps or asks
  // for confirmation. state.ready (set by the model only after an explicit
  // recap + confirmation, per the persona) must also be true -- this is the
  // same bug found and fixed in nest-key-app/lib/chatHandler.js; it was never
  // backported here until now.
  return allFilled && isValidEmail(state.email) && state.ready === true;
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

  // Lightweight NK visibility into activity, not just completions -- logged on
  // the first turn only. keyHistory starts with 1 seed assistant message
  // client-side, so the first real request already has 2 messages (seed +
  // the landlord's first reply) by the time it's sent -- checking <= 1 here
  // was checking for a state that's already impossible by the first request,
  // so it never fired. Awaited (not fire-and-forget) so it isn't killed by
  // Vercel freezing the function once the response is sent -- same lesson as
  // the un-awaited email bug found and fixed in nest-key-app. Caught
  // separately so a failure never blocks the landlord's chat.
  if (messages.length <= 2) {
    const nestKeyAppUrl = process.env.NEST_KEY_APP_URL || 'https://nest-key-app.vercel.app';
    try {
      const logRes = await fetch(`${nestKeyAppUrl}/api/log-event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ flow: 'landlord_intake' }),
      });
      if (!logRes.ok) console.error('log-event responded', logRes.status);
    } catch (err) {
      console.error('log-event call failed:', err);
    }
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
