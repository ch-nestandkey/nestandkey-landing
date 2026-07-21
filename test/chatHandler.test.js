const test = require('node:test');
const assert = require('node:assert/strict');
const { runChatTurn, isValidEmail, callClaude } = require('../lib/chatHandler');

// callClaude short-circuits before ever reaching fetch if this isn't set --
// tests below stub fetch and don't care about the key itself.
if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = 'test-key';

function mockFetchOnce(responseText, { ok = true, status = 200 } = {}) {
  const original = global.fetch;
  global.fetch = async () => ({
    ok,
    status,
    json: async () => ({ content: [{ text: responseText }] }),
    text: async () => responseText,
  });
  return () => { global.fetch = original; };
}

test('isValidEmail', () => {
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(undefined), false);
});

test('runChatTurn rejects missing messages/state', async () => {
  const result = await runChatTurn({ persona: 'x', requiredFields: [], messages: null, state: {} });
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, 'bad request');
});

test('runChatTurn rejects sessions over 40 messages', async () => {
  const messages = Array.from({ length: 41 }, () => ({ role: 'user', content: 'hi' }));
  const result = await runChatTurn({ persona: 'x', requiredFields: [], messages, state: {} });
  assert.equal(result.statusCode, 429);
  assert.equal(result.error, 'session too long');
});

test('runChatTurn merges non-empty STATE fields and keeps existing values for empty ones', async () => {
  const restore = mockFetchOnce('Sounds good.\n[[STATE]]\n{"roomType":"","location":"Oakland","ready":false}');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: ['roomType'],
      messages: [{ role: 'user', content: 'hi' }],
      state: { roomType: 'private room', location: '' },
    });
    assert.equal(result.state.roomType, 'private room'); // empty extracted value must not overwrite
    assert.equal(result.state.location, 'Oakland'); // non-empty extracted value wins
    assert.equal(result.reply, 'Sounds good.');
  } finally {
    restore();
  }
});

test('runChatTurn blocks a suspicious truncation on an identity field', async () => {
  const restore = mockFetchOnce('Ok.\n[[STATE]]\n{"name":"Taylor","ready":false}');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: ['name'],
      messages: [{ role: 'user', content: 'hi' }],
      state: { name: 'Taylor Kim' },
    });
    // "Taylor" is a truncated prefix of "Taylor Kim" with no correction stated in
    // the turn -- the guard must keep the original, fuller value. This is the
    // exact live bug the guard was written to catch (key-chat.js), now shared.
    assert.equal(result.state.name, 'Taylor Kim');
  } finally {
    restore();
  }
});

test('runChatTurn allows a real correction on an identity field', async () => {
  const restore = mockFetchOnce('Got it.\n[[STATE]]\n{"name":"Jordan Lee","ready":false}');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: ['name'],
      messages: [{ role: 'user', content: 'actually my name is Jordan Lee' }],
      state: { name: 'Taylor Kim' },
    });
    assert.equal(result.state.name, 'Jordan Lee');
  } finally {
    restore();
  }
});

test("runChatTurn requires the model's own ready flag, not just filled fields", async () => {
  const restore = mockFetchOnce('Here is the recap.\n[[STATE]]\n{"roomType":"private room","email":"t@example.com","ready":false}');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: ['roomType', 'email'],
      messages: [{ role: 'user', content: 'private room, t@example.com' }],
      state: {},
    });
    // Every required field is filled, but the model hasn't confirmed the recap yet --
    // this was previously ungated in chat.js (Nest); only key-chat.js had this fix.
    assert.equal(result.ready, false);
  } finally {
    restore();
  }
});

test('runChatTurn sets ready only once fields are complete, email is valid, and model confirms', async () => {
  const restore = mockFetchOnce('Great, all set!\n[[STATE]]\n{"roomType":"private room","email":"t@example.com","ready":true}');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: ['roomType', 'email'],
      messages: [{ role: 'user', content: 'yes that looks right' }],
      state: { roomType: 'private room', email: '' },
    });
    assert.equal(result.ready, true);
  } finally {
    restore();
  }
});

test('runChatTurn falls back to existing state on malformed STATE JSON', async () => {
  const restore = mockFetchOnce('Oops.\n[[STATE]]\n{not valid json');
  try {
    const result = await runChatTurn({
      persona: 'x',
      requiredFields: [],
      messages: [{ role: 'user', content: 'hi' }],
      state: { name: 'Taylor Kim' },
    });
    assert.equal(result.state.name, 'Taylor Kim');
    assert.equal(result.error, undefined);
  } finally {
    restore();
  }
});

test('callClaude surfaces missing API key as a config error, not a crash', async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await callClaude({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.statusCode, 500);
    assert.equal(result.error, 'api key not configured');
  } finally {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test('callClaude surfaces an upstream error without throwing', async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const restoreFetch = mockFetchOnce('', { ok: false, status: 503 });
  try {
    const result = await callClaude({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result.statusCode, 502);
    assert.equal(result.error, 'upstream error');
  } finally {
    restoreFetch();
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});
