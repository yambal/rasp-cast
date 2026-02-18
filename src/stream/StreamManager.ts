import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import type { Response } from 'express';
import { parseFile } from 'music-metadata';
import { IcyInterleaver } from './IcyMetadata.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

interface ClientConnection {
  res: Response;
  wantsMetadata: boolean;
  icyInterleaver: IcyInterleaver | null;
}

interface TrackInfo {
  id: string;
  type: 'file' | 'url';
  title: string;
  artist: string;
  filePath?: string;
  filename?: string;
  url?: string;
  cached?: boolean;
}

export interface PlaylistFileTrack {
  id?: string;
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
  private playlistPath: string = '';
  private abortController: AbortController | null = null;
  /** MP3 ビットレート (kbps) に応じた送信レート制御 */
  private targetBitrate = 128; // kbps
  /** 割り込み再生用 */
  private interruptTracks: TrackInfo[] = [];
  private isPlayingInterrupt = false;
  /** キャッシュディレクトリ */
  private cacheDir: string;

  constructor(musicDir: string, cacheDir: string) {
    this.musicDir = musicDir;
    this.cacheDir = cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /** URLトラックをキャッシュディレクトリにダウンロード */
  async downloadToCache(url: string, id: string): Promise<string> {
    const cachePath = path.join(this.cacheDir, `${id}.mp3`);

    if (fs.existsSync(cachePath)) {
      console.log(`[StreamManager] Cache hit: ${id} (${url})`);
      return cachePath;
    }

    console.log(`[StreamManager] Downloading: "${id}" from ${url}`);
    const tempPath = cachePath + '.tmp';

    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    if (!response.body) {
      throw new Error(`No response body for ${url}`);
    }

    const nodeStream = Readable.fromWeb(response.body as any);
    const writeStream = fs.createWriteStream(tempPath);
    await pipeline(nodeStream, writeStream);

    fs.renameSync(tempPath, cachePath);
    const size = fs.statSync(cachePath).size;
    console.log(`[StreamManager] Downloaded: ${id} (${(size / 1024).toFixed(0)} KB)`);
    return cachePath;
  }

  /** キャッシュファイルを削除 */
  deleteCacheFile(id: string): void {
    const cachePath = path.join(this.cacheDir, `${id}.mp3`);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      console.log(`[StreamManager] Cache deleted: ${id}`);
    }
  }

  async loadPlaylist(playlistPath: string): Promise<number> {
    this.playlistPath = playlistPath;
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
    let needsSave = false;
    this.tracks = [];
    for (const entry of playlist.tracks) {
      try {
        // IDが無いトラックにはIDを自動付与
        if (!entry.id) {
          entry.id = crypto.randomUUID();
          needsSave = true;
        }
        // URLトラックはキャッシュが無ければ自動ダウンロード
        if (entry.type === 'url' && entry.url) {
          try {
            await this.downloadToCache(entry.url, entry.id);
          } catch (err: any) {
            console.error(`[StreamManager] ⚠️  Failed to cache "${entry.title}": ${err.message}`);
          }
        }
        this.tracks.push(await this.buildTrackInfo(entry));
      } catch {
        // 無効なエントリはスキップ
      }
    }
    // IDを付与した場合、playlist.jsonに永続化
    if (needsSave && this.playlistPath) {
      fs.writeFileSync(this.playlistPath, JSON.stringify(playlist, null, 2) + '\n', 'utf-8');
      console.log('[StreamManager] Assigned IDs to tracks and saved playlist.json');
    }
  }

  private async buildTrackInfo(entry: PlaylistFileTrack): Promise<TrackInfo> {
    if (entry.type === 'file' && entry.path) {
      const filePath = path.isAbsolute(entry.path)
        ? entry.path
        : path.join(this.musicDir, '..', entry.path);
      const filename = path.basename(filePath);
      let title = entry.title || path.basename(filename, '.mp3');
      let artist = entry.artist || 'Unknown';

      if (!entry.title || !entry.artist) {
        try {
          const metadata = await parseFile(filePath);
          if (!entry.title && metadata.common.title) title = metadata.common.title;
          if (!entry.artist && metadata.common.artist) artist = metadata.common.artist;
        } catch {
          // ID3 読取失敗時はフォールバック値を使用
        }
      }

      return { id: entry.id || crypto.randomUUID(), type: 'file', filePath, filename, title, artist };
    }
    if (entry.type === 'url' && entry.url) {
      const id = entry.id || crypto.randomUUID();
      const cachePath = path.join(this.cacheDir, `${id}.mp3`);
      const cached = fs.existsSync(cachePath);
      return {
        id,
        type: 'url',
        url: entry.url,
        filePath: cached ? cachePath : undefined,
        cached,
        title: entry.title || 'Unknown',
        artist: entry.artist || 'Unknown',
      };
    }
    throw new Error('Invalid track: type with path (file) or url (url) required');
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

      this.tracks.push({ id: crypto.randomUUID(), type: 'file', filePath, title, artist, filename: file });
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
      // 割り込みトラックが待機中ならプレイリストより先に再生
      if (this.interruptTracks.length > 0) {
        await this.playInterrupt();
        continue;
      }

      await this.playTrack(this.tracks[this.currentIndex]);

      // 割り込みで中断された場合は同じ曲を維持（次回再生時に再度再生）
      if (this.interruptTracks.length > 0) {
        continue;
      }

      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
    }
  }

  /** 割り込み再生を要求する。現在の曲を中断し、指定トラックを順次再生後プレイリストに復帰 */
  async interrupt(trackInputs: PlaylistFileTrack | PlaylistFileTrack[]): Promise<void> {
    const inputs = Array.isArray(trackInputs) ? trackInputs : [trackInputs];
    const tracks: TrackInfo[] = [];
    for (const input of inputs) {
      tracks.push(await this.buildTrackInfo(input));
    }
    this.interruptTracks = tracks;
    this.skip();
  }

  private async playInterrupt(): Promise<void> {
    this.isPlayingInterrupt = true;
    const totalTracks = this.interruptTracks.length;
    console.log(`[StreamManager] Starting interrupt playback: ${totalTracks} tracks queued`);

    let trackNumber = 1;
    while (this.interruptTracks.length > 0) {
      const track = this.interruptTracks.shift()!;
      const remaining = this.interruptTracks.length;
      console.log(`[StreamManager] Playing interrupt [${trackNumber}/${totalTracks}]: "${track.title}" (${remaining} remaining)`);

      const startTime = Date.now();
      await this.playTrack(track);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`[StreamManager] Finished interrupt [${trackNumber}/${totalTracks}]: "${track.title}" (${duration}s)`);
      trackNumber++;
    }

    this.isPlayingInterrupt = false;
    console.log(`[StreamManager] Interrupt finished, played ${trackNumber - 1}/${totalTracks} tracks, resuming playlist`);
  }

  skip(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  skipTo(id: string): boolean {
    const index = this.tracks.findIndex((t) => t.id === id);
    if (index === -1) return false;
    // 指定トラックの1つ前にセット（skip後に+1されるため）
    this.currentIndex = index === 0 ? this.tracks.length - 1 : index - 1;
    this.skip();
    return true;
  }

  getStatus() {
    return {
      version,
      isStreaming: this.isStreaming,
      isPlayingInterrupt: this.isPlayingInterrupt,
      listeners: this.clients.size,
      currentTrack: this.currentTrack
        ? { id: this.currentTrack.id, title: this.currentTrack.title, artist: this.currentTrack.artist, filename: this.currentTrack.filename }
        : null,
      totalTracks: this.tracks.length,
      currentIndex: this.currentIndex,
    };
  }

  getPlaylist(): PlaylistFileTrack[] {
    return this.tracks.map((t) => {
      if (t.type === 'file') {
        const rel = t.filePath
          ? path.relative(path.join(this.musicDir, '..'), t.filePath).replace(/\\/g, '/')
          : undefined;
        return { id: t.id, type: 'file' as const, path: rel, title: t.title, artist: t.artist };
      }
      return { id: t.id, type: 'url' as const, url: t.url, title: t.title, artist: t.artist };
    });
  }

  async setPlaylist(tracks: PlaylistFileTrack[]): Promise<number> {
    // IDが無いトラックにはIDを付与
    for (const track of tracks) {
      if (!track.id) {
        track.id = crypto.randomUUID();
      }
    }

    const playlist: PlaylistFile = { tracks };
    fs.writeFileSync(this.playlistPath, JSON.stringify(playlist, null, 2) + '\n', 'utf-8');
    // loadFromPlaylistFile 内でURLキャッシュ・TrackInfo構築を一括実行
    await this.loadFromPlaylistFile(playlist);
    this.adjustCurrentIndex();
    console.log(`[StreamManager] Playlist updated: ${this.tracks.length} tracks`);
    return this.tracks.length;
  }

  async addTrack(track: PlaylistFileTrack): Promise<{ id: string; trackCount: number }> {
    const current = this.getPlaylist();
    const id = track.id || crypto.randomUUID();
    current.push({ ...track, id });
    // setPlaylist → loadFromPlaylistFile でURLキャッシュ実行
    const trackCount = await this.setPlaylist(current);
    return { id, trackCount };
  }

  async removeTrack(id: string): Promise<number> {
    const current = this.getPlaylist();
    const index = current.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Track not found: ${id}`);
    }

    // URLトラックのキャッシュを即時削除
    const removed = current[index];
    if (removed.type === 'url') {
      this.deleteCacheFile(id);
    }

    current.splice(index, 1);
    // 削除位置に応じて currentIndex を調整
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      // 現在再生中のトラックが削除された場合、次の曲へスキップ
      this.skip();
    }
    const count = await this.setPlaylist(current);
    return count;
  }

  private adjustCurrentIndex(): void {
    if (this.tracks.length === 0) {
      this.currentIndex = 0;
    } else if (this.currentIndex >= this.tracks.length) {
      this.currentIndex = 0;
    }
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

    if (track.filePath) {
      await this.playLocalTrack(track);
    } else {
      console.warn(`[StreamManager] ⚠️  No playable file for "${track.title}" (type=${track.type}, cached=${track.cached}) - skipping`);
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

  private streamWithRateControl(
    stream: Readable,
    signal: AbortSignal,
    resolve: () => void,
    label: string,
  ): void {
    // ビットレートに合わせた送信レート制御
    // 128kbps = 16000 bytes/sec
    const bytesPerSecond = (this.targetBitrate * 1000) / 8;
    let totalBytesSent = 0;
    const startTime = Date.now();
    let chunkQueue: Buffer[] = [];
    let isSending = false;

    const sendNextChunk = async () => {
      if (isSending || chunkQueue.length === 0 || signal.aborted) return;
      isSending = true;

      const buf = chunkQueue.shift()!;
      totalBytesSent += buf.length;

      // 期待される送信タイミングを計算
      const expectedTime = (totalBytesSent / bytesPerSecond) * 1000;
      const actualTime = Date.now() - startTime;
      const delay = expectedTime - actualTime;

      // 送信が速すぎる場合は待機（最大1秒まで）
      if (delay > 0) {
        await new Promise(r => setTimeout(r, Math.min(delay, 1000)));
      }

      if (!signal.aborted) {
        this.broadcast(buf);
      }

      isSending = false;
      // 次のチャンクを送信
      setImmediate(() => sendNextChunk());
    };

    stream.on('data', (chunk: Buffer | string) => {
      if (signal.aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunkQueue.push(buf);
      sendNextChunk();
    });

    stream.on('end', () => {
      // 残りのチャンクを送信してから終了
      const waitForQueue = setInterval(() => {
        if (chunkQueue.length === 0 && !isSending) {
          clearInterval(waitForQueue);
          signal.removeEventListener('abort', () => {});
          resolve();
        }
      }, 50);
    });

    stream.on('error', (err) => {
      console.error(`[StreamManager] Error streaming ${label}:`, err.message);
      chunkQueue = [];
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
