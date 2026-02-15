import type { Response } from 'express';
export interface PlaylistFileTrack {
    id?: string;
    type: 'file' | 'url';
    path?: string;
    url?: string;
    title?: string;
    artist?: string;
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
    /** レート倍率（1.0 = ぴったり、1.05 = 5%速め でバッファ余裕を持たせる） */
    private rateMultiplier;
    /** Burst on connect: 新規クライアントに送る初期バーストバッファ (128kbps × 4秒 ≈ 64KB) */
    private burstBuffer;
    private readonly burstSize;
    /** 割り込み再生用 */
    private interruptTracks;
    private isPlayingInterrupt;
    constructor(musicDir: string);
    loadPlaylist(playlistPath: string): Promise<number>;
    private loadFromPlaylistFile;
    private buildTrackInfo;
    private scanMusicDir;
    addClient(res: Response, wantsMetadata: boolean): void;
    startStreaming(): Promise<void>;
    /** 割り込み再生を要求する。現在の曲を中断し、指定トラックを順次再生後プレイリストに復帰 */
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
    getPlaylist(): PlaylistFileTrack[];
    setPlaylist(tracks: PlaylistFileTrack[]): Promise<number>;
    addTrack(track: PlaylistFileTrack): Promise<{
        id: string;
        trackCount: number;
    }>;
    removeTrack(id: string): Promise<number>;
    private adjustCurrentIndex;
    private getCurrentTitle;
    private playTrack;
    private playLocalTrack;
    private playUrlTrack;
    private streamWithRateControl;
    private broadcast;
}
