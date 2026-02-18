import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { StreamManager } from './stream/StreamManager.js';
import { createStreamRoutes } from './routes/stream.routes.js';
import { createPlaylistRoutes } from './routes/playlist.routes.js';
import { createInterruptRoutes } from './routes/interrupt.routes.js';
import { createScheduleRoutes } from './routes/schedule.routes.js';
import { ScheduleManager } from './schedule/ScheduleManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, '..', 'music');
const PORT = Number(process.env.PORT) || 3000;

const PLAYLIST_PATH = process.env.PLAYLIST_PATH || path.join(__dirname, '..', 'playlist.json');
const SCHEDULE_PATH = process.env.SCHEDULE_PATH || path.join(__dirname, '..', 'schedule.json');
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '..', 'cache');

async function main() {
  const app = express();
  const streamManager = new StreamManager(MUSIC_DIR, CACHE_DIR);
  const scheduleManager = new ScheduleManager(SCHEDULE_PATH, streamManager);

  const trackCount = await streamManager.loadPlaylist(PLAYLIST_PATH);
  if (trackCount === 0) {
    console.warn(`[rasp-cast] No tracks found. Use playlist.json or place .mp3 files in ${MUSIC_DIR}`);
    console.warn(`[rasp-cast] Server will start but streaming is paused until tracks are added.`);
  }

  await scheduleManager.load();

  app.use(express.json());
  app.use(createStreamRoutes(streamManager, scheduleManager));
  app.use(createPlaylistRoutes(streamManager));
  app.use(createInterruptRoutes(streamManager));
  app.use(createScheduleRoutes(scheduleManager));

  // Serve frontend static files (production build)
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

  app.listen(PORT, () => {
    console.log(`[rasp-cast] Server running on http://localhost:${PORT}`);
    console.log(`[rasp-cast] Stream URL: http://localhost:${PORT}/stream`);
    console.log(`[rasp-cast] Status:     http://localhost:${PORT}/status`);
    console.log(`[rasp-cast] ${trackCount} tracks loaded`);
  });

  if (trackCount > 0) {
    streamManager.startStreaming();
  }
}

main().catch((err) => {
  console.error('[rasp-cast] Fatal error:', err);
  process.exit(1);
});
