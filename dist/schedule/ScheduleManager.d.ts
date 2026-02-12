import type { StreamManager, PlaylistFileTrack } from '../stream/StreamManager.js';
interface ScheduledProgram {
    id: string;
    name: string;
    cron: string;
    track: PlaylistFileTrack;
    enabled: boolean;
}
export type { ScheduledProgram };
export declare class ScheduleManager {
    private programs;
    private cronJobs;
    private schedulePath;
    private streamManager;
    constructor(schedulePath: string, streamManager: StreamManager);
    /** schedule.json を読み込み、有効なジョブを登録 */
    load(): number;
    getPrograms(): ScheduledProgram[];
    getProgramsWithNextRun(): (ScheduledProgram & {
        nextRun: string | null;
    })[];
    addProgram(input: Omit<ScheduledProgram, 'id'>): ScheduledProgram;
    updateProgram(id: string, input: Partial<Omit<ScheduledProgram, 'id'>>): ScheduledProgram;
    deleteProgram(id: string): void;
    stopAll(): void;
    private save;
    private registerAllJobs;
    private registerJob;
    private unregisterJob;
}
