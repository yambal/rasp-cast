import type { Response } from 'express';
export interface PlaylistFileTrack {
    id?: string;
    type: 'file' | 'url';
    path?: string;
    url?: string;
    title?: string;
    artist?: string;
    cached?: boolean;
}
export declare class StreamManager {
    private clients;
    private tracks;
    private currentIndex;
    private isStreaming;
    private currentTrack;
    private musicDir;
    private playlistPath;
    private abortController;
    /** MP3 ビットレート (kbps) に応じた送信レート制御 */
    private targetBitrate;
    /** 最後にデータを送信した時刻（診断用） */
    private lastBroadcastTime;
    /** 割り込み再生用 */
    private interruptTracks;
    private isPlayingInterrupt;
    /** シャッフル再生 */
    private shuffle;
    /** キャッシュディレクトリ */
    private cacheDir;
    constructor(musicDir: string, cacheDir: string);
    /** URLトラックをキャッシュディレクトリにダウンロード（ffmpegで128kbps/44.1kHzに正規化） */
    downloadToCache(url: string, id: string): Promise<string>;
    /** キャッシュファイルを削除 */
    deleteCacheFile(id: string): void;
    loadPlaylist(playlistPath: string): Promise<number>;
    private loadFromPlaylistFile;
    private buildTrackInfo;
    private scanMusicDir;
    /** Fisher-Yates シャッフル */
    private shuffleTracks;
    addClient(res: Response, wantsMetadata: boolean): void;
    startStreaming(): Promise<void>;
    /** 割り込み再生を要求する。現在の曲が自然終了した後、指定トラックを順次再生しプレイリストに復帰 */
    interrupt(trackInputs: PlaylistFileTrack | PlaylistFileTrack[]): Promise<void>;
    private playInterrupt;
    skip(): void;
    skipTo(id: string): boolean;
    getStatus(): {
        version: any;
        isStreaming: boolean;
        isPlayingInterrupt: boolean;
        listeners: number;
        currentTrack: {
            id: string;
            title: string;
            artist: string;
            filename: string | undefined;
        } | null;
        totalTracks: number;
        currentIndex: number;
    };
    getCacheStatus(): {
        files: {
            id: string;
            size: number;
            title: string | undefined;
            artist: string | undefined;
        }[];
        totalSize: number;
        totalFiles: number;
    };
    /**
     * キャッシュ整合性チェック＆クリーンアップ
     * @param extraValidIds プレイリスト以外（スケジュール等）のURLトラックID
     * @returns 孤立ファイル削除結果と欠損キャッシュ情報
     */
    cleanupCache(extraValidIds?: Set<string>): {
        tracks: Array<{
            id: string;
            title: string;
            url: string;
            cached: boolean;
            size: number | null;
        }>;
        orphaned: Array<{
            id: string;
            size: number;
        }>;
        deletedCount: number;
        freedBytes: number;
    };
    getPlaylist(): {
        shuffle: boolean;
        tracks: PlaylistFileTrack[];
    };
    setPlaylist(tracks: PlaylistFileTrack[], shuffle?: boolean): Promise<number>;
    addTrack(track: PlaylistFileTrack): Promise<{
        id: string;
        trackCount: number;
    }>;
    removeTrack(id: string): Promise<number>;
    private adjustCurrentIndex;
    private getCurrentTitle;
    private playTrack;
    private playLocalTrack;
    private streamWithRateControl;
    /** トラック間ギャップのログ記録（無音フレーム送信は廃止 — デコーダー互換性問題のため） */
    private startSilence;
    private stopSilence;
    private broadcast;
}
