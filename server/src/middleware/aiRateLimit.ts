import { rateLimit } from 'express-rate-limit'

// Keyed by user id (requireAuth runs first), so one agent can't flood the AI queue.
export const aiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: req => req.currentUser?.id ?? 'anonymous',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests' })
  },
})
