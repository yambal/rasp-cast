import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import type { Response } from 'express';
import { parseFile } from 'music-metadata';
import { ICY_METAINT, IcyInterleaver } from './IcyMetadata.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

interface ClientConnection {
  res: Response;
  wantsMetadata: boolean;
  icyInterleaver: IcyInterleaver | null;
}

interface TrackInfo {
  type: 'file' | 'url';
  title: string;
  artist: string;
  // file 用
  filePath?: string;
  filename?: string;
  // url 用
  url?: string;
}

interface PlaylistFileTrack {
  type: 'file' | 'url';
  path?: string;
  url?: string;
  title?: string;
  artist?: string;
}

interface PlaylistFile {
  tracks: PlaylistFileTrack[];
}

export class StreamManager {
  private clients = new Set<ClientConnection>();
  private tracks: TrackInfo[] = [];
  private currentIndex = 0;
  private isStreaming = false;
  private currentTrack: TrackInfo | null = null;
  private musicDir: string;
  private abortController: AbortController | null = null;
  /** MP3 ビットレート (kbps) に応じた送信レート制御 */
  private targetBitrate = 128; // kbps

  constructor(musicDir: string) {
    this.musicDir = musicDir;
  }

  async loadPlaylist(playlistPath: string): Promise<number> {
    // playlist.json が存在すればそちらを使う
    if (fs.existsSync(playlistPath)) {
      try {
        const raw = fs.readFileSync(playlistPath, 'utf-8');
        const playlist: PlaylistFile = JSON.parse(raw);
        await this.loadFromPlaylistFile(playlist);
        if (this.tracks.length > 0) {
          console.log(`[StreamManager] Loaded ${this.tracks.length} tracks from playlist`);
          return this.tracks.length;
        }
        console.log('[StreamManager] Playlist empty, falling back to directory scan');
      } catch (err) {
        console.error('[StreamManager] Failed to parse playlist, falling back to directory scan:', err);
      }
    }

    // フォールバック: music/ ディレクトリスキャン
    return this.scanMusicDir();
  }

  private async loadFromPlaylistFile(playlist: PlaylistFile): Promise<void> {
    this.tracks = [];

    for (const entry of playlist.tracks) {
      if (entry.type === 'file' && entry.path) {
        const filePath = path.isAbsolute(entry.path)
          ? entry.path
          : path.join(this.musicDir, '..', entry.path);
        const filename = path.basename(filePath);
        let title = entry.title || path.basename(filename, '.mp3');
        let artist = entry.artist || 'Unknown';

        // JSON に title/artist がなければ ID3 タグから取得
        if (!entry.title || !entry.artist) {
          try {
            const metadata = await parseFile(filePath);
            if (!entry.title && metadata.common.title) title = metadata.common.title;
            if (!entry.artist && metadata.common.artist) artist = metadata.common.artist;
          } catch {
            // ID3 読取失敗時はフォールバック値を使用
          }
        }

        this.tracks.push({ type: 'file', filePath, filename, title, artist });
      } else if (entry.type === 'url' && entry.url) {
        this.tracks.push({
          type: 'url',
          url: entry.url,
          title: entry.title || 'Unknown',
          artist: entry.artist || 'Unknown',
        });
      }
    }
  }

  private async scanMusicDir(): Promise<number> {
    const files = fs.readdirSync(this.musicDir)
      .filter(f => f.toLowerCase().endsWith('.mp3'))
      .sort();

    this.tracks = [];
    for (const file of files) {
      const filePath = path.join(this.musicDir, file);
      let title = path.basename(file, '.mp3');
      let artist = 'Unknown';

      try {
        const metadata = await parseFile(filePath);
        if (metadata.common.title) title = metadata.common.title;
        if (metadata.common.artist) artist = metadata.common.artist;
      } catch {
        // ID3 読取失敗時はファイル名をフォールバック
      }

      this.tracks.push({ type: 'file', filePath, title, artist, filename: file });
    }

    console.log(`[StreamManager] Scanned ${this.tracks.length} tracks from directory`);
    return this.tracks.length;
  }

  addClient(res: Response, wantsMetadata: boolean): void {
    const client: ClientConnection = {
      res,
      wantsMetadata,
      icyInterleaver: wantsMetadata ? new IcyInterleaver(this.getCurrentTitle()) : null,
    };

    this.clients.add(client);
    console.log(`[StreamManager] Client connected (metadata=${wantsMetadata}). Total: ${this.clients.size}`);

    res.on('close', () => {
      this.clients.delete(client);
      console.log(`[StreamManager] Client disconnected. Total: ${this.clients.size}`);
    });
  }

  async startStreaming(): Promise<void> {
    if (this.isStreaming) return;
    if (this.tracks.length === 0) {
      console.log('[StreamManager] No tracks to stream');
      return;
    }

    this.isStreaming = true;
    console.log('[StreamManager] Streaming started');

    while (this.isStreaming) {
      await this.playTrack(this.tracks[this.currentIndex]);
      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
    }
  }

  skip(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  getStatus() {
    return {
      version,
      isStreaming: this.isStreaming,
      listeners: this.clients.size,
      currentTrack: this.currentTrack
        ? { title: this.currentTrack.title, artist: this.currentTrack.artist, filename: this.currentTrack.filename }
        : null,
      totalTracks: this.tracks.length,
      currentIndex: this.currentIndex,
    };
  }

  private getCurrentTitle(): string {
    if (!this.currentTrack) return '';
    const { artist, title } = this.currentTrack;
    return artist !== 'Unknown' ? `${artist} - ${title}` : title;
  }

  private async playTrack(track: TrackInfo): Promise<void> {
    this.currentTrack = track;
    const displayTitle = this.getCurrentTitle();
    console.log(`[StreamManager] Now playing: ${displayTitle}`);

    // 全クライアントのメタデータを更新
    for (const client of this.clients) {
      if (client.icyInterleaver) {
        client.icyInterleaver.updateTitle(displayTitle);
      }
    }

    if (track.type === 'file') {
      await this.playLocalTrack(track);
    } else {
      await this.playUrlTrack(track);
    }
  }

  private async playLocalTrack(track: TrackInfo): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    return new Promise<void>((resolve) => {
      const stream = createReadStream(track.filePath!, { highWaterMark: 16384 });

      const onAbort = () => {
        stream.destroy();
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });

      this.streamWithRateControl(stream, signal, resolve, track.filename || 'unknown');
    });
  }

  private async playUrlTrack(track: TrackInfo): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      const response = await fetch(track.url!, { signal });
      if (!response.ok) {
        console.error(`[StreamManager] HTTP ${response.status} fetching ${track.url}`);
        return;
      }
      if (!response.body) {
        console.error(`[StreamManager] No response body for ${track.url}`);
        return;
      }

      const nodeStream = Readable.fromWeb(response.body as any);

      return new Promise<void>((resolve) => {
        const onAbort = () => {
          nodeStream.destroy();
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });

        this.streamWithRateControl(nodeStream, signal, resolve, track.url || 'unknown');
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(`[StreamManager] Error fetching ${track.url}:`, err.message);
    }
  }

  private streamWithRateControl(
    stream: Readable,
    signal: AbortSignal,
    resolve: () => void,
    label: string,
  ): void {
    // ビットレートに合わせた送信レート制御
    // 128kbps = 16000 bytes/sec → 16384 bytes chunk ≈ 1.024 sec
    const bytesPerSecond = (this.targetBitrate * 1000) / 8;
    let totalBytesSent = 0;
    const startTime = Date.now();

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (signal.aborted) return;

      // レート制御: 送信が速すぎる場合は pause して待つ
      totalBytesSent += buf.length;
      const expectedTime = (totalBytesSent / bytesPerSecond) * 1000;
      const actualTime = Date.now() - startTime;
      const delay = expectedTime - actualTime;

      if (delay > 50) {
        stream.pause();
        setTimeout(() => {
          if (!signal.aborted) stream.resume();
        }, delay);
      }

      this.broadcast(buf);
    });

    stream.on('end', () => {
      signal.removeEventListener('abort', () => {});
      resolve();
    });

    stream.on('error', (err) => {
      console.error(`[StreamManager] Error streaming ${label}:`, err.message);
      resolve();
    });
  }

  private broadcast(chunk: Buffer): void {
    for (const client of this.clients) {
      if (client.res.destroyed) {
        this.clients.delete(client);
        continue;
      }

      try {
        if (client.wantsMetadata && client.icyInterleaver) {
          const dataWithMeta = client.icyInterleaver.process(chunk);
          client.res.write(dataWithMeta);
        } else {
          client.res.write(chunk);
        }
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
