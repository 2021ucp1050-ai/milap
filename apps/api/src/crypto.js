import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-only-change-me';
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const derived = Buffer.from(await scryptAsync(password, salt, 64));
  const actual = Buffer.from(hex, 'hex');
  if (derived.length !== actual.length) return false;
  return timingSafeEqual(derived, actual);
}

export function newOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(code) {
  return createHmac('sha256', jwtSecret()).update(String(code)).digest('hex');
}

export function codesMatch(code, storedHash) {
  const given = Buffer.from(hashCode(code));
  const stored = Buffer.from(String(storedHash));
  if (given.length !== stored.length) return false;
  return timingSafeEqual(given, stored);
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signJwt(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }));
  const signature = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw failAuth();
  const [header, body, signature] = parts;
  const expected = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url');
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw failAuth();
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!payload?.exp || payload.exp * 1000 < Date.now()) throw failAuth();
  return payload;
}

function failAuth() {
  const error = new Error('bad token');
  error.status = 401;
  return error;
}
