import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config } from './config.js';
import { api } from './api.js';
import { cleanupSessions, loadUser, requireAppHeader } from './auth.js';
import { startSyncSchedule } from './sync.js';

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(
  '/images',
  express.static(config.imageDir, {
    maxAge: '365d',
    immutable: true,
    fallthrough: false,
  }),
);

app.use(
  '/api',
  express.json({ limit: '5mb' }),
  (req, res, next) => {
    req.body ??= {};
    next();
  },
  requireAppHeader,
  loadUser,
  api,
);

// Single page app: static assets plus index.html for every other route.
if (fs.existsSync(config.publicDir)) {
  app.use(express.static(config.publicDir, { index: false, maxAge: '7d' }));
  app.get(/.*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });
} else {
  console.warn(`[web] ${config.publicDir} not found - only the API is served`);
}

app.use((err, req, res, next) => {
  if (err.status === 404) return res.status(404).end();
  console.error(err);
  res.status(500).end();
});

app.listen(config.port, () => {
  console.log(`RiftGallery listening on :${config.port} (data in ${config.dataDir})`);
  startSyncSchedule();
  cleanupSessions();
  setInterval(cleanupSessions, 6 * 3600 * 1000).unref();
});
