import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
import { requireApiKey } from '../middleware/auth.js';

export function createPlaylistRoutes(streamManager: StreamManager): Router {
  const router = Router();

  /**
   * GET /playlist — 現在のプレイリスト取得
   */
  router.get('/playlist', requireApiKey, (_req, res) => {
    const { shuffle, tracks } = streamManager.getPlaylist();
    res.json({ shuffle, tracks });
  });

  /**
   * PUT /playlist — プレイリスト全体を置換
   * Body: { shuffle?: boolean, tracks: PlaylistFileTrack[] }
   */
  router.put('/playlist', requireApiKey, async (req, res) => {
    try {
      const { shuffle, tracks } = req.body;
      if (!Array.isArray(tracks)) {
        res.status(400).json({ error: 'tracks must be an array' });
        return;
      }
      const count = await streamManager.setPlaylist(tracks, shuffle);
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
      const { id, trackCount } = await streamManager.addTrack(track);
      res.json({ ok: true, id, trackCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /playlist/tracks/:id — トラック削除 (UUID 指定)
   */
  router.delete('/playlist/tracks/:id', requireApiKey, async (req, res) => {
    try {
      const count = await streamManager.removeTrack(req.params.id as string);
      res.json({ ok: true, trackCount: count });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}
