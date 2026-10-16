import path from 'node:path';

const env = process.env;

const dataDir = path.resolve(env.DATA_DIR || './data');

export const config = {
  port: Number(env.PORT || 3000),
  dataDir,
  dbFile: path.join(dataDir, 'riftgallery.db'),
  imageDir: path.join(dataDir, 'images'),
  publicDir: path.resolve(env.PUBLIC_DIR || '../web/dist'),
  apiBase: (env.RIFTCODEX_API || 'https://api.riftcodex.com').replace(/\/$/, ''),
  // Hours between automatic card syncs. 0 disables the timer (manual sync still works).
  syncIntervalHours: Number(env.SYNC_INTERVAL_HOURS ?? 24),
  // Riot's official card gallery: fills in sets Riftcodex does not have yet. Empty string disables it.
  riotGalleryUrl: env.RIOT_GALLERY_URL ?? 'https://riftbound.leagueoflegends.com/en-us/card-gallery/',
  // Only used for local testing: cap how many images are downloaded per sync.
  imageLimit: env.IMAGE_LIMIT ? Number(env.IMAGE_LIMIT) : Infinity,
  imageConcurrency: Number(env.IMAGE_CONCURRENCY || 4),
  // Express "trust proxy" setting, so secure cookies and client IPs work behind nginx.
  trustProxy: env.TRUST_PROXY || 'loopback, linklocal, uniquelocal',
  sessionDays: Number(env.SESSION_DAYS || 30),
  userAgent: 'RiftGallery/1.0 (+self-hosted collection tracker)',
};
