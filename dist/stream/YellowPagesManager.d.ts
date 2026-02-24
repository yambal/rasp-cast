import type { StreamManager } from './StreamManager.js';
export interface YPConfig {
    host: string;
    port: number;
    stationName: string;
    genre: string;
    url: string;
    bitrate: number;
    maxListeners: number;
    contentType: string;
    /** リレーサーバー (host:port)。設定時はYPリクエストをリレー経由で送信 */
    relay?: string;
}
export declare class YellowPagesManager {
    private config;
    private streamManager;
    private ypId;
    private touchTimer;
    private touchFreqMinutes;
    private registered;
    constructor(config: YPConfig, streamManager: StreamManager);
    /** /addsrv でYPにステーション登録 */
    register(): Promise<boolean>;
    /** /tchsrv でトラック・リスナー情報を更新 */
    touch(): Promise<void>;
    /** /remsrv でステーション登録解除 */
    remove(): Promise<void>;
    /** タイマー停止 + 登録解除 */
    stop(): Promise<void>;
    /** 登録状態を返す */
    getStatus(): {
        registered: boolean;
        ypId: string | null;
        touchFreqMinutes: number;
        genre: string;
    };
    private startTouching;
    private stopTouching;
    /** YPサーバーへHTTP GETリクエストを送信し、icy-* レスポンスをパースして返す */
    private ypRequest;
    /** "icy-key: value" 形式のレスポンスをパース */
    private parseYPResponse;
}
