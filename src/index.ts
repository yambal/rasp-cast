import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { StreamManager } from './stream/StreamManager.js';
import { createStreamRoutes } from './routes/stream.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, '..', 'music');
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const app = express();
  const streamManager = new StreamManager(MUSIC_DIR);

  const trackCount = await streamManager.scanMusic();
  if (trackCount === 0) {
    console.error(`[rasp-cast] No MP3 files found in ${MUSIC_DIR}`);
    console.error('[rasp-cast] Place some .mp3 files in the music/ directory and restart.');
    process.exit(1);
  }

  app.use(createStreamRoutes(streamManager));

  app.listen(PORT, () => {
    console.log(`[rasp-cast] Server running on http://localhost:${PORT}`);
    console.log(`[rasp-cast] Stream URL: http://localhost:${PORT}/stream`);
    console.log(`[rasp-cast] Status:     http://localhost:${PORT}/status`);
    console.log(`[rasp-cast] ${trackCount} tracks loaded`);
  });

  streamManager.startStreaming();
}

main().catch((err) => {
  console.error('[rasp-cast] Fatal error:', err);
  process.exit(1);
});
