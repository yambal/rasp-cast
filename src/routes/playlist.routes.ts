import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
import { requireApiKey } from '../middleware/auth.js';

export function createPlaylistRoutes(streamManager: StreamManager): Router {
  const router = Router();

  /**
   * GET /playlist — 現在のプレイリスト取得
   */
  router.get('/playlist', (_req, res) => {
    res.json({ tracks: streamManager.getPlaylist() });
  });

  /**
   * PUT /playlist — プレイリスト全体を置換
   * Body: { tracks: PlaylistFileTrack[] }
   */
  router.put('/playlist', requireApiKey, async (req, res) => {
    try {
      const { tracks } = req.body;
      if (!Array.isArray(tracks)) {
        res.status(400).json({ error: 'tracks must be an array' });
        return;
      }
      const count = await streamManager.setPlaylist(tracks);
      res.json({ ok: true, trackCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /playlist/tracks — トラック追加
   * Body: { type, path?, url?, title?, artist? }
   */
  router.post('/playlist/tracks', requireApiKey, async (req, res) => {
    try {
      const track = req.body;
      if (!track.type || (track.type === 'file' && !track.path) || (track.type === 'url' && !track.url)) {
        res.status(400).json({ error: 'Invalid track: type with path (file) or url (url) required' });
        return;
      }
      const count = await streamManager.addTrack(track);
      res.json({ ok: true, trackCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /playlist/tracks/:index — トラック削除
   */
  router.delete('/playlist/tracks/:index', requireApiKey, async (req, res) => {
    try {
      const index = parseInt(req.params.index as string, 10);
      if (isNaN(index)) {
        res.status(400).json({ error: 'Invalid index' });
        return;
      }
      const count = await streamManager.removeTrack(index);
      res.json({ ok: true, trackCount: count });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
