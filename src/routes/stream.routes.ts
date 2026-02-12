import { Router } from 'express';
import { ICY_METAINT } from '../stream/IcyMetadata.js';
import type { StreamManager } from '../stream/StreamManager.js';
import { requireApiKey } from '../middleware/auth.js';

export function createStreamRoutes(streamManager: StreamManager): Router {
  const router = Router();

  /**
   * GET /stream - MP3 ストリーム (ICY 対応)
   *
   * クライアントが `Icy-MetaData: 1` ヘッダーを送った場合、
   * ICY メタデータを 8192 バイト間隔で挿入する。
   */
  router.get('/stream', (req, res) => {
    const wantsMetadata = req.headers['icy-metadata'] === '1';

    const headers: Record<string, string> = {
      'Content-Type': 'audio/mpeg',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
      'icy-name': 'Rasp-Cast',
      'icy-genre': 'Mixed',
      'icy-br': '128',
      'icy-pub': '0',
    };

    if (wantsMetadata) {
      headers['icy-metaint'] = String(ICY_METAINT);
    }

    res.writeHead(200, headers);
    streamManager.addClient(res, wantsMetadata);
  });

  /**
   * GET /status - 現在の配信状態 (デバッグ用)
   */
  router.get('/status', (_req, res) => {
    res.json(streamManager.getStatus());
  });

  /**
   * POST /skip - 曲をスキップ (デバッグ用)
   */
  router.post('/skip', requireApiKey, (_req, res) => {
    streamManager.skip();
    res.json({ ok: true, message: 'Skipping to next track' });
  });

  return router;
}
