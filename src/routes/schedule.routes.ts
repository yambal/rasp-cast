import { Router } from 'express';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
import { requireApiKey } from '../middleware/auth.js';

function validateTrack(track: any): boolean {
  return track && track.type && (
    (track.type === 'file' && track.path) ||
    (track.type === 'url' && track.url)
  );
}

export function createScheduleRoutes(scheduleManager: ScheduleManager): Router {
  const router = Router();

  /**
   * GET /schedule — 番組一覧取得
   */
  router.get('/schedule', (_req, res) => {
    res.json({ programs: scheduleManager.getProgramsWithNextRun() });
  });

  /**
   * POST /schedule/programs — 番組追加
   * Body: { name, cron, tracks: [{ type, path?, url?, title?, artist? }], enabled? }
   * 後方互換: track (単一) も受付
   */
  router.post('/schedule/programs', requireApiKey, async (req, res) => {
    try {
      const { name, cron, tracks: rawTracks, track, enabled } = req.body;
      // 後方互換: track (単一) → tracks (配列)
      const tracks = rawTracks || (track ? [track] : null);
      if (!name || !cron || !tracks || !Array.isArray(tracks) || tracks.length === 0) {
        res.status(400).json({ error: 'name, cron, and tracks (array) are required' });
        return;
      }
      for (const t of tracks) {
        if (!validateTrack(t)) {
          res.status(400).json({ error: 'Invalid track: type with path (file) or url (url) required' });
          return;
        }
      }
      const program = await scheduleManager.addProgram({ name, cron, tracks, enabled });
      res.json({ ok: true, program });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * PUT /schedule/programs/:id — 番組更新
   */
  router.put('/schedule/programs/:id', requireApiKey, async (req, res) => {
    try {
      const program = await scheduleManager.updateProgram(req.params.id as string, req.body);
      res.json({ ok: true, program });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  /**
   * DELETE /schedule/programs/:id — 番組削除
   */
  router.delete('/schedule/programs/:id', requireApiKey, (req, res) => {
    try {
      scheduleManager.deleteProgram(req.params.id as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}
