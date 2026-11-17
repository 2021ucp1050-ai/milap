import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { verifyJwt } from './crypto.js';
import { uploadDir } from './db.js';
import {
  applyPaymentEvent,
  assertNoGovernmentId,
  completeDemoKyc,
  discover,
  getMe,
  getPublicProfile,
  listInterests,
  listMatches,
  listMessages,
  listPlans,
  login,
  passOn,
  registerUser,
  resendOtp,
  respondToInterest,
  revealContact,
  savePhoto,
  savePreferences,
  saveProfile,
  sendInterest,
  sendMessage,
  startCheckout,
  verifyEmail,
} from './domain.js';

const buckets = new Map();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function rateLimit(max) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const key = `${req.ip}:${req.path}:${req.body?.email || ''}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) {
      buckets.set(key, { count: 1, reset: now + 15 * 60 * 1000 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.', code: 'RATE_LIMIT' });
    }
    return next();
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = verifyJwt(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Sign in required', code: 'AUTH' });
  }
}

function photoUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir()),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safe = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '';
        cb(null, `${randomUUID()}${safe || '.jpg'}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        cb(new Error('Use a JPEG, PNG, or WebP photo'));
        return;
      }
      cb(null, true);
    },
  }).single('photo');
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const origins = process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()).filter(Boolean);
  app.use(cors({ origin: origins?.length ? origins : true }));

  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook is not configured' });
    const expected = createHmac('sha256', secret).update(req.body).digest('hex');
    const given = String(req.header('x-razorpay-signature') || '');
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    return res.json(applyPaymentEvent(event));
  });

  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(uploadDir(), { index: false, dotfiles: 'deny' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'milap-api' });
  });

  app.post('/api/auth/register', rateLimit(20), asyncHandler(async (req, res) => {
    res.status(201).json(await registerUser(req.body || {}));
  }));
  app.post('/api/auth/resend-otp', rateLimit(10), asyncHandler(async (req, res) => {
    res.json(await resendOtp(req.body || {}));
  }));
  app.post('/api/auth/verify-email', rateLimit(20), asyncHandler(async (req, res) => {
    res.json(await verifyEmail(req.body || {}));
  }));
  app.post('/api/auth/login', rateLimit(20), asyncHandler(async (req, res) => {
    res.json(await login(req.body || {}));
  }));

  app.get('/api/plans', (req, res) => {
    res.json({ plans: listPlans() });
  });

  app.use('/api', requireAuth);
  app.get('/api/me', (req, res) => res.json(getMe(req.userId)));
  app.put('/api/me/profile', asyncHandler(async (req, res) => {
    res.json(saveProfile(req.userId, req.body || {}));
  }));
  app.put('/api/me/preferences', asyncHandler(async (req, res) => {
    res.json(savePreferences(req.userId, req.body || {}));
  }));
  app.post('/api/me/photo', (req, res, next) => {
    photoUpload()(req, res, (error) => {
      if (error) return next(error);
      return next();
    });
  }, asyncHandler(async (req, res) => {
    if (!req.file) throw Object.assign(new Error('Choose a photo'), { status: 400 });
    res.json(savePhoto(req.userId, req.file.filename));
  }));
  app.post('/api/me/kyc', asyncHandler(async (req, res) => {
    assertNoGovernmentId(req.body || {}, { rejectTwelveDigits: true });
    res.json(completeDemoKyc(req.userId, req.body || {}));
  }));

  app.get('/api/discover', asyncHandler(async (req, res) => {
    res.json(discover(req.userId, req.query || {}));
  }));
  app.get('/api/profiles/:id', asyncHandler(async (req, res) => {
    res.json(getPublicProfile(req.userId, req.params.id));
  }));
  app.post('/api/passes', asyncHandler(async (req, res) => {
    res.json(passOn(req.userId, req.body?.userId));
  }));
  app.get('/api/interests', (req, res) => res.json(listInterests(req.userId)));
  app.post('/api/interests', asyncHandler(async (req, res) => {
    res.status(201).json(sendInterest(req.userId, req.body?.toUserId));
  }));
  app.post('/api/interests/:id/respond', asyncHandler(async (req, res) => {
    res.json(respondToInterest(req.userId, req.params.id, req.body?.action));
  }));
  app.get('/api/matches', (req, res) => res.json({ matches: listMatches(req.userId) }));
  app.get('/api/matches/:otherId/messages', asyncHandler(async (req, res) => {
    res.json(listMessages(req.userId, req.params.otherId));
  }));
  app.post('/api/matches/:otherId/messages', asyncHandler(async (req, res) => {
    res.status(201).json(sendMessage(req.userId, req.params.otherId, req.body?.body));
  }));
  app.get('/api/matches/:otherId/contact', asyncHandler(async (req, res) => {
    res.json(revealContact(req.userId, req.params.otherId));
  }));
  app.post('/api/billing/checkout', asyncHandler(async (req, res) => {
    res.json(await startCheckout(req.userId, req.body?.plan));
  }));

  const webDist = process.env.WEB_DIST || path.resolve(import.meta.dirname, '../../web/dist');
  const indexHtml = path.join(webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(indexHtml, (error) => error && next(error));
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    if (status >= 500) console.error(error);
    const message = status >= 500
      ? 'Something went wrong'
      : (error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be under 2 MB' : error.message);
    res.status(status).json({ error: message, code: error.code });
  });

  return app;
}
