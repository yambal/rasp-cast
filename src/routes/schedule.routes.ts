import { Router } from 'express';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
import { requireApiKey } from '../middleware/auth.js';

export function createScheduleRoutes(scheduleManager: ScheduleManager): Router {
  const router = Router();

  /**
   * GET /schedule — 番組一覧取得
   */
  router.get('/schedule', (_req, res) => {
    res.json({ programs: scheduleManager.getPrograms() });
  });

  /**
   * POST /schedule/programs — 番組追加
   * Body: { name, cron, track: { type, path?, url?, title?, artist? }, enabled? }
   */
  router.post('/schedule/programs', requireApiKey, (req, res) => {
    try {
      const { name, cron, track, enabled } = req.body;
      if (!name || !cron || !track) {
        res.status(400).json({ error: 'name, cron, and track are required' });
        return;
      }
      if (!track.type || (track.type === 'file' && !track.path) || (track.type === 'url' && !track.url)) {
        res.status(400).json({ error: 'Invalid track: type with path (file) or url (url) required' });
        return;
      }
      const program = scheduleManager.addProgram({ name, cron, track, enabled });
      res.json({ ok: true, program });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * PUT /schedule/programs/:id — 番組更新
   */
  router.put('/schedule/programs/:id', requireApiKey, (req, res) => {
    try {
      const program = scheduleManager.updateProgram(req.params.id as string, req.body);
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
