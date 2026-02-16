import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable, PassThrough } from 'node:stream';
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
  id: string;
  type: 'file' | 'url';
  title: string;
  artist: string;
  // file 用
  filePath?: string;
  filename?: string;
  // url 用
  url?: string;
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
  /** 無音 MP3 フレーム: MPEG1 Layer3 128kbps 44.1kHz ステレオ (417 bytes/frame ≈ 26ms) */
  private static readonly SILENCE_FRAME = (() => {
    const frame = Buffer.alloc(417, 0);
    frame[0] = 0xFF; // Sync
    frame[1] = 0xFB; // MPEG1, Layer3, no CRC
    frame[2] = 0x90; // 128kbps, 44100Hz
    frame[3] = 0x00; // Stereo
    return frame;
  })();
  /** 割り込み再生用 */
  private interruptTracks: TrackInfo[] = [];
  private isPlayingInterrupt = false;

  constructor(musicDir: string) {
    this.musicDir = musicDir;
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
    this.tracks = [];
    for (const entry of playlist.tracks) {
      try {
        this.tracks.push(await this.buildTrackInfo(entry));
      } catch {
        // 無効なエントリはスキップ
      }
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
      return {
        id: entry.id || crypto.randomUUID(),
        type: 'url',
        url: entry.url,
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

      // 割り込みで中断された場合は次の曲へ進める
      if (this.interruptTracks.length > 0) {
        this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
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
    while (this.interruptTracks.length > 0) {
      const track = this.interruptTracks.shift()!;
      console.log(`[StreamManager] Playing interrupt: ${track.title}`);
      await this.playTrack(track);
    }
    this.isPlayingInterrupt = false;
    console.log('[StreamManager] Interrupt finished, resuming playlist');
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
    const playlist: PlaylistFile = { tracks };
    fs.writeFileSync(this.playlistPath, JSON.stringify(playlist, null, 2) + '\n', 'utf-8');
    await this.loadFromPlaylistFile(playlist);
    this.adjustCurrentIndex();
    console.log(`[StreamManager] Playlist updated: ${this.tracks.length} tracks`);
    return this.tracks.length;
  }

  async addTrack(track: PlaylistFileTrack): Promise<{ id: string; trackCount: number }> {
    const current = this.getPlaylist();
    const id = track.id || crypto.randomUUID();
    current.push({ ...track, id });
    const trackCount = await this.setPlaylist(current);
    return { id, trackCount };
  }

  async removeTrack(id: string): Promise<number> {
    const current = this.getPlaylist();
    const index = current.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Track not found: ${id}`);
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
      // トラック遷移ギャップを無音フレームで埋め、FMOD のストリーム断を防止
      // 無音フレームをレート制御されたストリームの一部として送信
      const stream = this.createStreamWithSilencePrefix(track.filePath!, 3);

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

    // skip シグナルと 10 秒タイムアウトを結合
    const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);

    try {
      const response = await fetch(track.url!, { signal: fetchSignal });

      if (!response.ok) {
        console.error(`[StreamManager] HTTP ${response.status} fetching ${track.url}`);
        return;
      }
      if (!response.body) {
        console.error(`[StreamManager] No response body for ${track.url}`);
        return;
      }

      const nodeStream = Readable.fromWeb(response.body as any);
      // 無音フレームを先頭に追加したストリームを作成
      const streamWithSilence = this.createStreamWithSilencePrefixFromStream(nodeStream, 3);

      return new Promise<void>((resolve) => {
        const onAbort = () => {
          streamWithSilence.destroy();
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });

        this.streamWithRateControl(streamWithSilence, signal, resolve, track.url || 'unknown');
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (err.name === 'TimeoutError') {
        console.error(`[StreamManager] Fetch timeout (10s) for ${track.url}`);
        return;
      }
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

      if (delay > 200) {
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

  /** 無音フレームを先頭に持つストリームを作成（レート制御の一部として処理） */
  private createStreamWithSilencePrefix(filePath: string, frameCount: number): Readable {
    const passThrough = new PassThrough({ highWaterMark: 16384 });

    // 無音フレームを先頭に書き込む
    for (let i = 0; i < frameCount; i++) {
      passThrough.write(StreamManager.SILENCE_FRAME);
    }

    // ファイルストリームをパイプ
    const fileStream = createReadStream(filePath, { highWaterMark: 16384 });
    fileStream.pipe(passThrough);

    // エラーハンドリング
    fileStream.on('error', (err) => {
      passThrough.destroy(err);
    });

    return passThrough;
  }

  /** 既存のストリームに無音フレームを先頭に追加（レート制御の一部として処理） */
  private createStreamWithSilencePrefixFromStream(sourceStream: Readable, frameCount: number): Readable {
    const passThrough = new PassThrough({ highWaterMark: 16384 });

    // 無音フレームを先頭に書き込む
    for (let i = 0; i < frameCount; i++) {
      passThrough.write(StreamManager.SILENCE_FRAME);
    }

    // ソースストリームをパイプ
    sourceStream.pipe(passThrough);

    // エラーハンドリング
    sourceStream.on('error', (err) => {
      passThrough.destroy(err);
    });

    return passThrough;
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
