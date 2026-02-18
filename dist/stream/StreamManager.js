import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { parseFile } from 'music-metadata';
import { IcyInterleaver } from './IcyMetadata.js';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');
const execFileAsync = promisify(execFile);
export class StreamManager {
    clients = new Set();
    tracks = [];
    currentIndex = 0;
    isStreaming = false;
    currentTrack = null;
    musicDir;
    playlistPath = '';
    abortController = null;
    /** MP3 ビットレート (kbps) に応じた送信レート制御 */
    targetBitrate = 128; // kbps
    /** 最後にデータを送信した時刻（診断用） */
    lastBroadcastTime = 0;
    /** 割り込み再生用 */
    interruptTracks = [];
    isPlayingInterrupt = false;
    /** シャッフル再生 */
    shuffle = false;
    /** キャッシュディレクトリ */
    cacheDir;
    constructor(musicDir, cacheDir) {
        this.musicDir = musicDir;
        this.cacheDir = cacheDir;
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    /** URLトラックをキャッシュディレクトリにダウンロード（ffmpegで128kbps/44.1kHzに正規化） */
    async downloadToCache(url, id) {
        const cachePath = path.join(this.cacheDir, `${id}.mp3`);
        if (fs.existsSync(cachePath)) {
            console.log(`[StreamManager] Cache hit: ${id} (${url})`);
            return cachePath;
        }
        console.log(`[StreamManager] Downloading: "${id}" from ${url}`);
        const rawPath = cachePath + '.tmp.raw';
        const tempPath = cachePath + '.tmp';
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        if (!response.body) {
            throw new Error(`No response body for ${url}`);
        }
        const nodeStream = Readable.fromWeb(response.body);
        const writeStream = fs.createWriteStream(rawPath);
        await pipeline(nodeStream, writeStream);
        // ffmpegで正規化 (128kbps, 44.1kHz, stereo)
        try {
            await execFileAsync('ffmpeg', [
                '-i', rawPath,
                '-ar', '44100',
                '-ab', '128k',
                '-ac', '2',
                '-f', 'mp3',
                '-y',
                tempPath,
            ]);
            console.log(`[StreamManager] Normalized: ${id} (128kbps/44.1kHz)`);
        }
        catch (err) {
            console.warn(`[StreamManager] ffmpeg normalization failed: ${err.message}, using raw file`);
            fs.renameSync(rawPath, tempPath);
        }
        fs.renameSync(tempPath, cachePath);
        if (fs.existsSync(rawPath))
            fs.unlinkSync(rawPath);
        const size = fs.statSync(cachePath).size;
        console.log(`[StreamManager] Downloaded: ${id} (${(size / 1024).toFixed(0)} KB)`);
        return cachePath;
    }
    /**
     * ローカルMP3ファイルをffmpegで正規化してキャッシュ
     * ファイルパス+mtime+sizeからハッシュを生成し、変更時のみ再変換する
     */
    async normalizeFile(sourcePath) {
        const stat = fs.statSync(sourcePath);
        const key = `${sourcePath}|${stat.mtimeMs}|${stat.size}`;
        const hash = crypto.createHash('md5').update(key).digest('hex').slice(0, 12);
        const basename = path.basename(sourcePath, '.mp3');
        const cacheName = `file_${basename}_${hash}.mp3`;
        const cachePath = path.join(this.cacheDir, cacheName);
        if (fs.existsSync(cachePath)) {
            return cachePath;
        }
        console.log(`[StreamManager] Normalizing file: ${path.basename(sourcePath)}`);
        const tempPath = cachePath + '.tmp';
        try {
            await execFileAsync('ffmpeg', [
                '-i', sourcePath,
                '-ar', '44100',
                '-ab', '128k',
                '-ac', '2',
                '-f', 'mp3',
                '-y',
                tempPath,
            ]);
            fs.renameSync(tempPath, cachePath);
            const size = fs.statSync(cachePath).size;
            console.log(`[StreamManager] Normalized: ${path.basename(sourcePath)} → ${cacheName} (${(size / 1024).toFixed(0)} KB)`);
            return cachePath;
        }
        catch (err) {
            console.warn(`[StreamManager] ffmpeg normalization failed for ${path.basename(sourcePath)}: ${err.message}, using original`);
            // 一時ファイル削除
            if (fs.existsSync(tempPath))
                fs.unlinkSync(tempPath);
            return sourcePath;
        }
    }
    /** キャッシュファイルを削除 */
    deleteCacheFile(id) {
        const cachePath = path.join(this.cacheDir, `${id}.mp3`);
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
            console.log(`[StreamManager] Cache deleted: ${id}`);
        }
    }
    async loadPlaylist(playlistPath) {
        this.playlistPath = playlistPath;
        // playlist.json が存在すればそちらを使う
        if (fs.existsSync(playlistPath)) {
            try {
                const raw = fs.readFileSync(playlistPath, 'utf-8');
                const playlist = JSON.parse(raw);
                await this.loadFromPlaylistFile(playlist);
                if (this.tracks.length > 0) {
                    console.log(`[StreamManager] Loaded ${this.tracks.length} tracks from playlist`);
                    return this.tracks.length;
                }
                console.log('[StreamManager] Playlist empty, falling back to directory scan');
            }
            catch (err) {
                console.error('[StreamManager] Failed to parse playlist, falling back to directory scan:', err);
            }
        }
        // フォールバック: music/ ディレクトリスキャン
        return this.scanMusicDir();
    }
    async loadFromPlaylistFile(playlist) {
        this.shuffle = playlist.shuffle ?? false;
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
                    }
                    catch (err) {
                        console.error(`[StreamManager] ⚠️  Failed to cache "${entry.title}": ${err.message}`);
                    }
                    // cached フラグをファイルのエントリに反映
                    const cachePath = path.join(this.cacheDir, `${entry.id}.mp3`);
                    const wasCached = entry.cached;
                    entry.cached = fs.existsSync(cachePath);
                    if (wasCached !== entry.cached)
                        needsSave = true;
                }
                this.tracks.push(await this.buildTrackInfo(entry));
            }
            catch {
                // 無効なエントリはスキップ
            }
        }
        // 変更があればplaylist.jsonに永続化
        if (needsSave && this.playlistPath) {
            fs.writeFileSync(this.playlistPath, JSON.stringify(playlist, null, 2) + '\n', 'utf-8');
            console.log('[StreamManager] Updated playlist.json (IDs/cached flags)');
        }
    }
    async buildTrackInfo(entry) {
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
                    if (!entry.title && metadata.common.title)
                        title = metadata.common.title;
                    if (!entry.artist && metadata.common.artist)
                        artist = metadata.common.artist;
                }
                catch {
                    // ID3 読取失敗時はフォールバック値を使用
                }
            }
            const normalizedPath = await this.normalizeFile(filePath);
            return { id: entry.id || crypto.randomUUID(), type: 'file', filePath: normalizedPath, originalPath: filePath, filename, title, artist };
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
    async scanMusicDir() {
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
                if (metadata.common.title)
                    title = metadata.common.title;
                if (metadata.common.artist)
                    artist = metadata.common.artist;
            }
            catch {
                // ID3 読取失敗時はファイル名をフォールバック
            }
            const normalizedPath = await this.normalizeFile(filePath);
            this.tracks.push({ id: crypto.randomUUID(), type: 'file', filePath: normalizedPath, originalPath: filePath, title, artist, filename: file });
        }
        console.log(`[StreamManager] Scanned ${this.tracks.length} tracks from directory`);
        return this.tracks.length;
    }
    /** Fisher-Yates シャッフル */
    shuffleTracks() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        console.log('[StreamManager] Playlist shuffled');
    }
    addClient(res, wantsMetadata) {
        const client = {
            res,
            wantsMetadata,
            icyInterleaver: wantsMetadata ? new IcyInterleaver(this.getCurrentTitle()) : null,
        };
        this.clients.add(client);
        console.log(`[StreamManager] Client connected (metadata=${wantsMetadata}). Total: ${this.clients.size}`);
        res.on('close', () => {
            this.clients.delete(client);
            const gap = this.lastBroadcastTime ? Date.now() - this.lastBroadcastTime : -1;
            console.log(`[StreamManager] Client disconnected. Total: ${this.clients.size} (last broadcast ${gap}ms ago)`);
        });
    }
    async startStreaming() {
        if (this.isStreaming)
            return;
        if (this.tracks.length === 0) {
            console.log('[StreamManager] No tracks to stream');
            return;
        }
        this.isStreaming = true;
        console.log('[StreamManager] Streaming started');
        let consecutiveSkips = 0;
        let lastTrackEndTime = Date.now();
        while (this.isStreaming) {
            // 割り込みトラックが待機中ならプレイリストより先に再生
            if (this.interruptTracks.length > 0) {
                await this.playInterrupt();
                consecutiveSkips = 0;
                lastTrackEndTime = Date.now();
                continue;
            }
            const track = this.tracks[this.currentIndex];
            const gapMs = Date.now() - lastTrackEndTime;
            if (gapMs > 500) {
                console.warn(`[StreamManager] ⚠️  Track transition gap: ${gapMs}ms before "${track.title}"`);
            }
            const trackStart = Date.now();
            await this.playTrack(track);
            this.startSilence();
            const trackDuration = Date.now() - trackStart;
            // 再生時間が極端に短い場合はスキップ扱い（100ms未満 = 再生不可）
            if (trackDuration < 100) {
                consecutiveSkips++;
                if (consecutiveSkips >= this.tracks.length) {
                    console.error(`[StreamManager] 🔇 All ${this.tracks.length} tracks skipped — no playable tracks. Waiting 10s...`);
                    await new Promise(r => setTimeout(r, 10_000));
                    consecutiveSkips = 0;
                }
            }
            else {
                consecutiveSkips = 0;
            }
            lastTrackEndTime = Date.now();
            this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
            if (this.currentIndex === 0 && this.shuffle) {
                this.shuffleTracks();
            }
            // 割り込みトラックが待機中なら次のループ先頭で検出・再生される
        }
        this.stopSilence();
    }
    /** 割り込み再生を要求する。現在の曲が自然終了した後、指定トラックを順次再生しプレイリストに復帰 */
    async interrupt(trackInputs) {
        const inputs = Array.isArray(trackInputs) ? trackInputs : [trackInputs];
        const tracks = [];
        for (const input of inputs) {
            tracks.push(await this.buildTrackInfo(input));
        }
        this.interruptTracks = tracks;
        console.log(`[StreamManager] Interrupt queued: ${tracks.length} tracks (will play after current track ends)`);
    }
    async playInterrupt() {
        this.isPlayingInterrupt = true;
        const totalTracks = this.interruptTracks.length;
        console.log(`[StreamManager] Starting interrupt playback: ${totalTracks} tracks queued`);
        let trackNumber = 1;
        while (this.interruptTracks.length > 0) {
            const track = this.interruptTracks.shift();
            const remaining = this.interruptTracks.length;
            console.log(`[StreamManager] Playing interrupt [${trackNumber}/${totalTracks}]: "${track.title}" (${remaining} remaining)`);
            const startTime = Date.now();
            await this.playTrack(track);
            this.startSilence(); // 割り込みトラック間も無音で埋める
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[StreamManager] Finished interrupt [${trackNumber}/${totalTracks}]: "${track.title}" (${duration}s)`);
            trackNumber++;
        }
        this.isPlayingInterrupt = false;
        // main loop に戻り、通常プレイリストを再開
        console.log(`[StreamManager] Interrupt finished, played ${trackNumber - 1}/${totalTracks} tracks, resuming playlist`);
    }
    skip() {
        if (this.abortController) {
            this.abortController.abort();
        }
    }
    skipTo(id) {
        const index = this.tracks.findIndex((t) => t.id === id);
        if (index === -1)
            return false;
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
    getCacheStatus() {
        let cacheFiles = [];
        try {
            cacheFiles = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.mp3'));
        }
        catch {
            // cacheDir が存在しない場合
        }
        const files = cacheFiles.map(f => {
            const id = path.basename(f, '.mp3');
            const size = fs.statSync(path.join(this.cacheDir, f)).size;
            const track = this.tracks.find(t => t.id === id);
            return { id, size, title: track?.title, artist: track?.artist };
        });
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        return { files, totalSize, totalFiles: files.length };
    }
    /**
     * キャッシュ整合性チェック＆クリーンアップ
     * @param extraValidIds プレイリスト以外（スケジュール等）のURLトラックID
     * @returns 孤立ファイル削除結果と欠損キャッシュ情報
     */
    cleanupCache(extraValidIds = new Set()) {
        // 有効なURLトラックIDを収集（プレイリスト）
        const validIds = new Set(extraValidIds);
        for (const track of this.tracks) {
            if (track.type === 'url' && track.id) {
                validIds.add(track.id);
            }
        }
        // キャッシュディレクトリの実ファイルを取得
        let cacheFiles = [];
        try {
            cacheFiles = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.mp3'));
        }
        catch {
            // cacheDir が存在しない場合
        }
        const cachedIds = new Set(cacheFiles.map(f => path.basename(f, '.mp3')));
        // 孤立ファイル検出＆削除
        const orphaned = [];
        let freedBytes = 0;
        for (const file of cacheFiles) {
            // file_ プレフィックスはローカルファイル正規化キャッシュ（ハッシュベース管理）
            if (file.startsWith('file_'))
                continue;
            const id = path.basename(file, '.mp3');
            if (!validIds.has(id)) {
                const filePath = path.join(this.cacheDir, file);
                const size = fs.statSync(filePath).size;
                fs.unlinkSync(filePath);
                console.log(`[StreamManager] Cleanup: deleted orphaned cache ${id} (${(size / 1024).toFixed(0)} KB)`);
                orphaned.push({ id, size });
                freedBytes += size;
            }
        }
        // 全URLトラックの cached 状態を構築
        const tracks = [];
        for (const track of this.tracks) {
            if (track.type === 'url' && track.id) {
                const cached = cachedIds.has(track.id);
                let size = null;
                if (cached) {
                    try {
                        size = fs.statSync(path.join(this.cacheDir, `${track.id}.mp3`)).size;
                    }
                    catch { /* deleted as orphan or race */ }
                }
                tracks.push({ id: track.id, title: track.title, url: track.url || '', cached, size });
            }
        }
        const missingCount = tracks.filter(t => !t.cached).length;
        console.log(`[StreamManager] Cache cleanup: ${orphaned.length} orphaned deleted (${(freedBytes / 1024).toFixed(0)} KB freed), ${missingCount} missing`);
        return { tracks, orphaned, deletedCount: orphaned.length, freedBytes };
    }
    getPlaylist() {
        return {
            shuffle: this.shuffle,
            tracks: this.tracks.map((t) => {
                if (t.type === 'file') {
                    const origPath = t.originalPath || t.filePath;
                    const rel = origPath
                        ? path.relative(path.join(this.musicDir, '..'), origPath).replace(/\\/g, '/')
                        : undefined;
                    return { id: t.id, type: 'file', path: rel, title: t.title, artist: t.artist };
                }
                return { id: t.id, type: 'url', url: t.url, title: t.title, artist: t.artist, cached: t.cached };
            }),
        };
    }
    async setPlaylist(tracks, shuffle) {
        // IDが無いトラックにはIDを付与
        for (const track of tracks) {
            if (!track.id) {
                track.id = crypto.randomUUID();
            }
        }
        const playlist = { shuffle: shuffle ?? this.shuffle, tracks };
        // loadFromPlaylistFile 内でURLキャッシュ・TrackInfo構築を一括実行
        await this.loadFromPlaylistFile(playlist);
        this.adjustCurrentIndex();
        console.log(`[StreamManager] Playlist updated: ${this.tracks.length} tracks (shuffle=${this.shuffle})`);
        return this.tracks.length;
    }
    async addTrack(track) {
        const { tracks: current } = this.getPlaylist();
        const id = track.id || crypto.randomUUID();
        current.push({ ...track, id });
        const trackCount = await this.setPlaylist(current);
        return { id, trackCount };
    }
    async removeTrack(id) {
        const { tracks: current } = this.getPlaylist();
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
        }
        else if (index === this.currentIndex) {
            // 現在再生中のトラックが削除された場合、次の曲へスキップ
            this.skip();
        }
        const count = await this.setPlaylist(current);
        return count;
    }
    adjustCurrentIndex() {
        if (this.tracks.length === 0) {
            this.currentIndex = 0;
        }
        else if (this.currentIndex >= this.tracks.length) {
            this.currentIndex = 0;
        }
    }
    getCurrentTitle() {
        if (!this.currentTrack)
            return '';
        const { artist, title } = this.currentTrack;
        return artist !== 'Unknown' ? `${artist} - ${title}` : title;
    }
    async playTrack(track) {
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
        }
        else {
            console.warn(`[StreamManager] ⚠️  No playable file for "${track.title}" (type=${track.type}, cached=${track.cached}) - skipping`);
        }
    }
    async playLocalTrack(track) {
        this.abortController = new AbortController();
        const { signal } = this.abortController;
        return new Promise((resolve) => {
            const stream = createReadStream(track.filePath, { highWaterMark: 16384 });
            const onAbort = () => {
                stream.destroy();
                resolve();
            };
            signal.addEventListener('abort', onAbort, { once: true });
            this.streamWithRateControl(stream, signal, resolve, track.title || track.filename || 'unknown');
        });
    }
    streamWithRateControl(stream, signal, resolve, label) {
        // ビットレートに合わせた送信レート制御
        // 128kbps = 16000 bytes/sec
        const bytesPerSecond = (this.targetBitrate * 1000) / 8;
        let totalBytesSent = 0;
        const startTime = Date.now();
        let chunkQueue = [];
        let isSending = false;
        let isFirstBroadcast = true;
        const sendNextChunk = async () => {
            if (isSending || chunkQueue.length === 0 || signal.aborted)
                return;
            isSending = true;
            const buf = chunkQueue.shift();
            totalBytesSent += buf.length;
            // 期待される送信タイミングを計算
            const expectedTime = (totalBytesSent / bytesPerSecond) * 1000;
            const actualTime = Date.now() - startTime;
            const delay = expectedTime - actualTime;
            // 初回チャンクは即時送信（トラック間ギャップを最小化）
            // 2回目以降はレート制御に従い待機
            if (isFirstBroadcast) {
                console.log(`[StreamManager] ▶ Track ready: "${label}"`);
                isFirstBroadcast = false;
            }
            else if (delay > 0) {
                await new Promise(r => setTimeout(r, Math.min(delay, 1000)));
            }
            if (!signal.aborted) {
                this.broadcast(buf);
            }
            isSending = false;
            // 次のチャンクを送信
            setImmediate(() => sendNextChunk());
        };
        stream.on('data', (chunk) => {
            if (signal.aborted)
                return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            chunkQueue.push(buf);
            sendNextChunk();
        });
        stream.on('end', () => {
            // 残りのチャンクを送信してから終了
            const waitForQueue = setInterval(() => {
                if (chunkQueue.length === 0 && !isSending) {
                    clearInterval(waitForQueue);
                    signal.removeEventListener('abort', () => { });
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
    /** トラック間ギャップのログ記録（無音フレーム送信は廃止 — デコーダー互換性問題のため） */
    startSilence() {
        // no-op: 初回チャンク即時送信でギャップを最小化する方式に移行
    }
    stopSilence() {
        // no-op
    }
    broadcast(chunk) {
        this.lastBroadcastTime = Date.now();
        for (const client of this.clients) {
            if (client.res.destroyed) {
                this.clients.delete(client);
                continue;
            }
            try {
                if (client.wantsMetadata && client.icyInterleaver) {
                    const dataWithMeta = client.icyInterleaver.process(chunk);
                    client.res.write(dataWithMeta);
                }
                else {
                    client.res.write(chunk);
                }
            }
            catch {
                this.clients.delete(client);
            }
        }
    }
}
