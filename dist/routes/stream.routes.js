import { Router } from 'express';
import { ICY_METAINT } from '../stream/IcyMetadata.js';
import { requireApiKey } from '../middleware/auth.js';
const STATION_NAME = process.env.STATION_NAME || 'YOUR STATION';
export function createStreamRoutes(streamManager) {
    const router = Router();
    /**
     * GET /stream - MP3 ストリーム (ICY 対応)
     *
     * クライアントが `Icy-MetaData: 1` ヘッダーを送った場合、
     * ICY メタデータを 8192 バイト間隔で挿入する。
     */
    router.get('/stream', (req, res) => {
        const wantsMetadata = req.headers['icy-metadata'] === '1';
        const headers = {
            'Content-Type': 'audio/mpeg',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache',
            'icy-name': STATION_NAME,
            'icy-genre': 'Mixed',
            'icy-br': '128',
            'icy-pub': '0',
        };
        if (wantsMetadata) {
            headers['icy-metaint'] = String(ICY_METAINT);
        }
        // Nagle アルゴリズム無効化: 小チャンクの送信遅延を排除
        res.socket?.setNoDelay(true);
        res.writeHead(200, headers);
        streamManager.addClient(res, wantsMetadata);
    });
    /**
     * GET /status - 現在の配信状態 (デバッグ用)
     */
    router.get('/status', (_req, res) => {
        const status = streamManager.getStatus();
        const streamUrl = process.env.PUBLIC_STREAM_URL || '';
        res.json({ ...status, streamUrl, stationName: STATION_NAME });
    });
    /**
     * GET /cache - キャッシュ状態
     */
    router.get('/cache', (_req, res) => {
        res.json(streamManager.getCacheStatus());
    });
    /**
     * POST /skip - 次の曲へスキップ
     * POST /skip/:id - 指定 ID の曲へスキップ
     */
    router.post('/skip/:id?', requireApiKey, (req, res) => {
        if (req.params.id) {
            const found = streamManager.skipTo(req.params.id);
            if (!found) {
                res.status(404).json({ error: `Track not found: ${req.params.id}` });
                return;
            }
            res.json({ ok: true, message: `Skipping to track ${req.params.id}` });
        }
        else {
            streamManager.skip();
            res.json({ ok: true, message: 'Skipping to next track' });
        }
    });
    return router;
}
