// Per-instance sliding-window counter. Resets on cold start (serverless
// instances are ephemeral) -- cheap insurance against one IP hammering an
// AI-cost endpoint, not real distributed rate limiting. Both chat.js and
// key-chat.js are public, unauthenticated endpoints with no secret gate.
// Mirrors nest-key-app's lib/rateLimit.js.
const buckets = new Map();

function isRateLimited(key, { max = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { isRateLimited, clientIp };
