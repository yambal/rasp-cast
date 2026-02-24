import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { StreamManager } from './stream/StreamManager.js';
import { createStreamRoutes } from './routes/stream.routes.js';
import { createPlaylistRoutes } from './routes/playlist.routes.js';
import { createInterruptRoutes } from './routes/interrupt.routes.js';
import { createScheduleRoutes } from './routes/schedule.routes.js';
import { ScheduleManager } from './schedule/ScheduleManager.js';
import { YellowPagesManager } from './stream/YellowPagesManager.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, '..', 'music');
const PORT = Number(process.env.PORT) || 3000;
const PLAYLIST_PATH = process.env.PLAYLIST_PATH || path.join(__dirname, '..', 'playlist.json');
const SCHEDULE_PATH = process.env.SCHEDULE_PATH || path.join(__dirname, '..', 'schedule.json');
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '..', 'cache');
const YP_ENABLED = process.env.YP_ENABLED === 'true';
const YP_HOST = process.env.YP_HOST || 'yp.shoutcast.com';
const YP_GENRE = process.env.YP_GENRE || 'Mixed';
const YP_URL = process.env.YP_URL || '';
const YP_PORT = Number(process.env.YP_PORT) || PORT;
const YP_MAX_LISTENERS = Number(process.env.YP_MAX_LISTENERS) || 32;
const STATION_NAME = process.env.STATION_NAME || 'YOUR STATION';
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
    // キャッシュキュー全完了時にプレイリスト再読込＋孤立ファイル自動クリーンアップ
    streamManager.onQueueEmpty = async () => {
        // 新たにキャッシュされたトラックを this.tracks に反映
        await streamManager.loadPlaylist(PLAYLIST_PATH);
        const scheduleTrackIds = new Set();
        for (const program of scheduleManager.getPrograms()) {
            for (const track of program.tracks) {
                if (track.type === 'url' && track.id) {
                    scheduleTrackIds.add(track.id);
                }
            }
        }
        streamManager.cleanupCache(scheduleTrackIds);
    };
    // YellowPages マネージャー
    let ypManager = null;
    if (YP_ENABLED) {
        ypManager = new YellowPagesManager({
            host: YP_HOST,
            port: YP_PORT,
            stationName: STATION_NAME,
            genre: YP_GENRE,
            url: YP_URL,
            bitrate: 128,
            maxListeners: YP_MAX_LISTENERS,
            contentType: 'audio/mpeg',
        }, streamManager);
    }
    app.use(express.json());
    app.use(createStreamRoutes(streamManager, scheduleManager, ypManager));
    app.use(createPlaylistRoutes(streamManager));
    app.use(createInterruptRoutes(streamManager));
    app.use(createScheduleRoutes(scheduleManager, streamManager));
    // GET /api-docs - API.md を text/plain で返す（AI / プログラム向け）
    const apiMdPath = path.join(__dirname, '..', 'API.md');
    app.get('/api-docs', (_req, res) => {
        if (!fs.existsSync(apiMdPath)) {
            res.status(404).send('API.md not found');
            return;
        }
        res.type('text/plain; charset=utf-8').send(fs.readFileSync(apiMdPath, 'utf-8'));
    });
    // Serve frontend static files (production build)
    app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
    app.listen(PORT, () => {
        console.log(`[rasp-cast] Server running on http://localhost:${PORT}`);
        console.log(`[rasp-cast] Stream URL: http://localhost:${PORT}/stream`);
        console.log(`[rasp-cast] Status:     http://localhost:${PORT}/status`);
        if (ypManager) {
            console.log(`[rasp-cast] YP:         ${YP_HOST} (genre=${YP_GENRE})`);
        }
        console.log(`[rasp-cast] ${trackCount} tracks loaded`);
    });
    if (trackCount > 0) {
        streamManager.startStreaming();
        if (ypManager) {
            ypManager.register();
        }
    }
    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`[rasp-cast] ${signal} received, shutting down...`);
        if (ypManager) {
            await ypManager.stop();
        }
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch((err) => {
    console.error('[rasp-cast] Fatal error:', err);
    process.exit(1);
});
