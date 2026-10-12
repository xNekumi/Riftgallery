import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { db } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'rg_session';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(req, value, maxAgeSeconds) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (req.secure) parts.push('Secure');
  return parts.join('; ');
}

export function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400 * 1000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expires.toISOString(),
  );
  res.setHeader('Set-Cookie', cookieHeader(req, token, config.sessionDays * 86400));
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

export function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.is_admin, defaultLanguage: u.default_language };
}

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db
      .prepare(
        `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(sha256(token), new Date().toISOString());
    if (row) req.user = row;
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admins only' });
  next();
}

/**
 * Mutating API calls must carry this header. Browsers cannot add it cross-site without a CORS
 * preflight, which this server never approves, so it doubles as CSRF protection.
 */
export function requireAppHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-RiftGallery') === '1') return next();
  res.status(403).json({ error: 'Missing request header' });
}

// Simple in-memory brute-force protection for the login form.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

export function loginBlocked(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
  return entry.count >= MAX_FAILURES;
}

export function recordLoginFailure(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(key, { first: Date.now(), count: 1 });
  else entry.count++;
}

export function clearLoginFailures(key) {
  failures.delete(key);
}

export function cleanupSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
