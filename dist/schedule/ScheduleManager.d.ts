import type { StreamManager, PlaylistFileTrack } from '../stream/StreamManager.js';
interface ScheduledProgram {
    id: string;
    name: string;
    cron: string;
    tracks: PlaylistFileTrack[];
    enabled: boolean;
}
export type { ScheduledProgram };
export declare class ScheduleManager {
    private programs;
    private cronJobs;
    private schedulePath;
    private streamManager;
    constructor(schedulePath: string, streamManager: StreamManager);
    /** schedule.json を読み込み、有効なジョブを登録（旧 track → tracks 自動マイグレーション） */
    load(): Promise<number>;
    getPrograms(): ScheduledProgram[];
    getProgramsWithNextRun(): (ScheduledProgram & {
        nextRun: string | null;
    })[];
    addProgram(input: Omit<ScheduledProgram, 'id'>): Promise<ScheduledProgram>;
    updateProgram(id: string, input: Partial<Omit<ScheduledProgram, 'id'>>): Promise<ScheduledProgram>;
    deleteProgram(id: string): void;
    stopAll(): void;
    private save;
    private registerAllJobs;
    private registerJob;
    private unregisterJob;
    /** URLトラックを事前ダウンロード */
    private cacheUrlTracks;
    /** URLトラックのキャッシュを削除 */
    private deleteCacheForTracks;
}
