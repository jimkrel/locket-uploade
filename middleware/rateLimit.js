/**
 * middleware/rateLimit.js
 * Rate limiting config – chống brute-force & lạm dụng API
 */
const rateLimit = require('express-rate-limit');

// Helper tạo response chuẩn khi bị rate limit
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    error: 'TOO_MANY_REQUESTS',
    message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
    retryAfter: Math.ceil(res.getHeader('Retry-After') || 60),
  });
};

/** /api/login – max 10 lần / 15 phút / IP */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: 'Quá nhiều lần đăng nhập. Thử lại sau 15 phút.',
});

/** /api/refresh – max 30 lần / 15 phút / IP */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** /api/upload – max 20 lần / 1 giờ / IP */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** /api/post – max 20 lần / 1 giờ / IP */
const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** General API – max 100 lần / 15 phút / IP */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

module.exports = { loginLimiter, refreshLimiter, uploadLimiter, postLimiter, generalLimiter };
