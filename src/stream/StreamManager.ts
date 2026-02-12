import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
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
  filePath: string;
  title: string;
  artist: string;
  filename: string;
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

  async scanMusic(): Promise<number> {
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

      this.tracks.push({ filePath, title, artist, filename: file });
    }

    console.log(`[StreamManager] Scanned ${this.tracks.length} tracks`);
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

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    return new Promise<void>((resolve) => {
      const stream = createReadStream(track.filePath, { highWaterMark: 16384 });

      // ビットレートに合わせた送信レート制御
      // 128kbps = 16000 bytes/sec → 16384 bytes chunk ≈ 1.024 sec
      const bytesPerSecond = (this.targetBitrate * 1000) / 8;
      let totalBytesSent = 0;
      const startTime = Date.now();

      const onAbort = () => {
        stream.destroy();
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });

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
        signal.removeEventListener('abort', onAbort);
        resolve();
      });

      stream.on('error', (err) => {
        console.error(`[StreamManager] Error reading ${track.filename}:`, err.message);
        signal.removeEventListener('abort', onAbort);
        resolve();
      });
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
