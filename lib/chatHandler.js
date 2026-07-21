// Single, shared implementation of the chat-turn loop used by both chat.js
// (Nest) and key-chat.js (Key/landlord intake). These two used to carry their
// own copies of this logic and silently diverged -- key-chat.js got a guard
// against a field truncating itself on a later turn (e.g. "Taylor Kim" ->
// "Taylor") and a fix requiring the model's own ready confirmation, not just
// filled fields; chat.js never got either backport. One shared copy means a
// fix here applies to both callers, not just whichever one someone
// remembered to patch. Mirrors nest-key-app's lib/chatHandler.js -- same
// reasoning, that repo hit the exact same divergence first.

const ATOMIC_IDENTITY_FIELDS = new Set(['name', 'email', 'phone']);

function isSuspiciousTruncation(oldVal, newVal) {
  if (!oldVal || !newVal) return false;
  const oldLower = oldVal.trim().toLowerCase();
  const newLower = newVal.trim().toLowerCase();
  return newLower.length < oldLower.length && oldLower.includes(newLower);
}

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
}

async function callClaude({ system, messages, model = 'claude-sonnet-4-6', maxTokens = 500 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'api key not configured', statusCode: 500 };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', errText);
    return { error: 'upstream error', statusCode: 502 };
  }

  const data = await response.json();
  return { text: data.content?.[0]?.text || '' };
}

async function runChatTurn({ persona, requiredFields, messages, state, model = 'claude-sonnet-4-6', maxTokens = 500 }) {
  if (!messages || !Array.isArray(messages) || !state) {
    return { error: 'bad request', statusCode: 400 };
  }
  if (messages.length > 40) {
    return { error: 'session too long', statusCode: 429 };
  }

  const callResult = await callClaude({ system: persona, messages, model, maxTokens });
  if (callResult.error) {
    return { error: callResult.error, statusCode: callResult.statusCode };
  }

  const raw = callResult.text;

  const stateMatch = raw.match(/\[\[STATE\]\]\s*(\{[\s\S]*?\})/);
  let newState = { ...state };
  if (stateMatch) {
    try {
      const extracted = JSON.parse(stateMatch[1]);
      // Non-empty extracted values win; keep existing for empty/missing.
      for (const [k, v] of Object.entries(extracted)) {
        if (v === '' || v === null || v === undefined) continue;
        if (ATOMIC_IDENTITY_FIELDS.has(k) && isSuspiciousTruncation(newState[k], v)) {
          continue; // looks like an accidental truncation, not a real correction -- keep existing
        }
        newState[k] = v;
      }
    } catch (_) {
      // malformed JSON -- keep existing state
    }
  }

  const reply = raw.replace(/\[\[STATE\]\][\s\S]*$/, '').trim();
  const allFilled = requiredFields.every((k) => (newState[k] || '').trim() !== '');
  // Fields-complete is necessary but not sufficient: a user can supply every
  // field in one dense message before the recap/confirmation step happens.
  // The model's own state.ready (set only after explicit user confirmation,
  // per the persona) must also be true.
  const ready = allFilled && isValidEmail(newState.email) && newState.ready === true;

  return { reply, state: newState, ready, statusCode: 200 };
}

module.exports = { isValidEmail, callClaude, runChatTurn };
