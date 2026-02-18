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
    /** ストリーミングビットレート (kbps) */
    private static readonly BITRATE_KBPS;
    /** トラック遷移で警告を出すギャップ閾値 (ms) */
    private static readonly GAP_WARN_THRESHOLD_MS;
    /** レート制御の最大遅延 (ms) */
    private static readonly MAX_RATE_DELAY_MS;
    /** 再生不可とみなす最小再生時間 (ms) */
    private static readonly MIN_TRACK_DURATION_MS;
    /** 全トラックスキップ時の待機時間 (ms) */
    private static readonly ALL_SKIP_WAIT_MS;
    private clients;
    private tracks;
    private currentIndex;
    private isStreaming;
    private currentTrack;
    private musicDir;
    private playlistPath;
    private abortController;
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
    /** ラウドネス測定値 (loudnorm 1st pass) */
    private static readonly LOUDNORM_TARGET;
    /**
     * ffmpegでMP3を128kbps/44.1kHz/ステレオに正規化 + ラウドネスノーマライズ(-14 LUFS, 2-pass)。
     * 成功時true、失敗時false
     */
    private transcodeWithFfmpeg;
    /** loudnorm 1st pass: ラウドネス測定値を取得 */
    private measureLoudness;
    /** URLトラックをキャッシュディレクトリにダウンロード（ffmpegで128kbps/44.1kHzに正規化） */
    downloadToCache(url: string, id: string): Promise<string>;
    /**
     * ローカルMP3ファイルをffmpegで正規化してキャッシュ
     * ファイルパス+mtime+sizeからハッシュを生成し、変更時のみ再変換する
     */
    private normalizeFile;
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
    private broadcast;
}
