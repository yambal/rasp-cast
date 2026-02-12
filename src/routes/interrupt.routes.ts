import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
import { requireApiKey } from '../middleware/auth.js';

export function createInterruptRoutes(streamManager: StreamManager): Router {
  const router = Router();

  /**
   * POST /interrupt — 割り込み再生
   * 現在の曲を中断し、指定トラックを再生後プレイリストに復帰
   * Body: { type, path?, url?, title?, artist? }
   */
  router.post('/interrupt', requireApiKey, async (req, res) => {
    try {
      const track = req.body;
      if (!track.type || (track.type === 'file' && !track.path) || (track.type === 'url' && !track.url)) {
        res.status(400).json({ error: 'Invalid track: type with path (file) or url (url) required' });
        return;
      }
      await streamManager.interrupt(track);
      res.json({ ok: true, message: 'Interrupt started' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
