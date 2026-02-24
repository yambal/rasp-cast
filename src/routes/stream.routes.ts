import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { ICY_METAINT } from '../stream/IcyMetadata.js';
import type { StreamManager } from '../stream/StreamManager.js';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
import type { YellowPagesManager } from '../stream/YellowPagesManager.js';
import { requireApiKey } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const STATION_NAME = process.env.STATION_NAME || 'YOUR STATION';

export function createStreamRoutes(streamManager: StreamManager, scheduleManager?: ScheduleManager, ypManager?: YellowPagesManager | null): Router {
  const router = Router();

  /**
   * GET /stream - MP3 ストリーム (ICY 対応)
   *
   * クライアントが `Icy-MetaData: 1` ヘッダーを送った場合、
   * ICY メタデータを 8192 バイト間隔で挿入する。
   */
  const streamHandler = (req: import('express').Request, res: import('express').Response) => {
    const wantsMetadata = req.headers['icy-metadata'] === '1';

    const headers: Record<string, string> = {
      'Server': 'SHOUTcast Distributed Network Audio Server/Linux v2.6',
      'Content-Type': 'audio/mpeg',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
      'icy-name': STATION_NAME,
      'icy-genre': ypManager ? (ypManager.getStatus().genre || 'Mixed') : 'Mixed',
      'icy-br': '128',
      'icy-pub': ypManager ? '1' : '0',
    };

    if (wantsMetadata) {
      headers['icy-metaint'] = String(ICY_METAINT);
    }

    // Nagle アルゴリズム無効化: 小チャンクの送信遅延を排除
    res.socket?.setNoDelay(true);
    res.writeHead(200, headers);
    streamManager.addClient(res, wantsMetadata);
  };

  router.get('/stream', streamHandler);

  // YP検証用: / へのリクエストでストリームクライアントと判定できる場合のみ応答
  router.get('/', (req, res, next) => {
    const isStreamClient = req.headers['icy-metadata'] === '1'
      || req.headers['user-agent']?.includes('WinampMPEG')
      || req.headers['user-agent']?.includes('NSPlayer')
      || req.headers['accept']?.includes('audio/');
    if (isStreamClient) {
      streamHandler(req, res);
    } else {
      next();
    }
  });

  /**
   * GET /7.html - DNAS 互換ステータスページ (YP 検証用)
   * 形式: currentListeners,streamStatus,peakListeners,maxListeners,uniqueListeners,bitrate,songTitle
   */
  router.get('/7.html', (_req, res) => {
    const status = streamManager.getStatus();
    const title = streamManager.getCurrentTitle();
    const maxListeners = ypManager ? ypManager.getStatus().genre ? 32 : 32 : 32;
    const line = `${status.listeners},1,${status.listeners},${maxListeners},${status.listeners},128,${title}`;
    res.set('Server', 'SHOUTcast Distributed Network Audio Server/Linux v2.6');
    res.type('text/html').send(`<html><body>${line}</body></html>`);
  });

  /**
   * GET /status - 現在の配信状態 (デバッグ用)
   */
  router.get('/status', (_req, res) => {
    const status = streamManager.getStatus();
    const pending = streamManager.getPendingDownloads();
    const streamUrl = process.env.PUBLIC_STREAM_URL || '';
    const yp = ypManager ? ypManager.getStatus() : undefined;
    res.json({ ...status, version: pkg.version, streamUrl, stationName: STATION_NAME, busy: pending.length > 0, pendingCaches: pending.length, yp });
  });

  /**
   * GET /cache - キャッシュ状態
   */
  router.get('/cache', (_req, res) => {
    res.json(streamManager.getCacheStatus());
  });

  /**
   * POST /cache/cleanup - キャッシュ整合性チェック＆孤立ファイル削除
   *
   * プレイリスト・スケジュールのどちらにも属さないキャッシュファイルを削除する。
   * キャッシュが欠けているURLトラックも報告する。
   */
  router.post('/cache/cleanup', requireApiKey, (_req, res) => {
    // スケジュールのURLトラックIDを収集
    const scheduleTrackIds = new Set<string>();
    if (scheduleManager) {
      for (const program of scheduleManager.getPrograms()) {
        for (const track of program.tracks) {
          if (track.type === 'url' && track.id) {
            scheduleTrackIds.add(track.id);
          }
        }
      }
    }

    const result = streamManager.cleanupCache(scheduleTrackIds);
    res.json({ ok: true, ...result });
  });

  /**
   * POST /skip - 次の曲へスキップ
   * POST /skip/:id - 指定 ID の曲へスキップ
   */
  router.post('/skip/:id?', requireApiKey, (req, res) => {
    if (req.params.id) {
      const found = streamManager.skipTo(req.params.id as string);
      if (!found) {
        res.status(404).json({ error: `Track not found: ${req.params.id}` });
        return;
      }
      res.json({ ok: true, message: `Skipping to track ${req.params.id}` });
    } else {
      streamManager.skip();
      res.json({ ok: true, message: 'Skipping to next track' });
    }
  });

  return router;
}
