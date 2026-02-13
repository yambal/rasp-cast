import fs from 'node:fs';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
export class ScheduleManager {
    programs = [];
    cronJobs = new Map();
    schedulePath;
    streamManager;
    constructor(schedulePath, streamManager) {
        this.schedulePath = schedulePath;
        this.streamManager = streamManager;
    }
    /** schedule.json を読み込み、有効なジョブを登録（旧 track → tracks 自動マイグレーション） */
    load() {
        if (fs.existsSync(this.schedulePath)) {
            try {
                const raw = fs.readFileSync(this.schedulePath, 'utf-8');
                const data = JSON.parse(raw);
                let needsSave = false;
                this.programs = (data.programs || []).map((p) => {
                    // 旧形式: track (単一) → tracks (配列) に変換
                    if (p.track && !p.tracks) {
                        p.tracks = [p.track];
                        delete p.track;
                        needsSave = true;
                    }
                    return p;
                });
                if (needsSave) {
                    this.save();
                    console.log('[ScheduleManager] Migrated schedule.json: track → tracks');
                }
            }
            catch (err) {
                console.error('[ScheduleManager] Failed to parse schedule.json:', err);
                this.programs = [];
            }
        }
        else {
            this.programs = [];
        }
        this.registerAllJobs();
        console.log(`[ScheduleManager] Loaded ${this.programs.length} programs (${this.cronJobs.size} active)`);
        return this.programs.length;
    }
    getPrograms() {
        return this.programs;
    }
    getProgramsWithNextRun() {
        return this.programs.map((p) => {
            let nextRun = null;
            if (p.enabled) {
                try {
                    const interval = CronExpressionParser.parse(p.cron, {
                        tz: 'Asia/Tokyo',
                    });
                    nextRun = interval.next().toISOString();
                }
                catch {
                    // invalid cron
                }
            }
            return { ...p, nextRun };
        });
    }
    addProgram(input) {
        if (!cron.validate(input.cron)) {
            throw new Error(`Invalid cron expression: ${input.cron}`);
        }
        const program = {
            id: crypto.randomUUID(),
            name: input.name,
            cron: input.cron,
            tracks: input.tracks,
            enabled: input.enabled !== undefined ? input.enabled : true,
        };
        this.programs.push(program);
        this.save();
        this.registerJob(program);
        return program;
    }
    updateProgram(id, input) {
        const index = this.programs.findIndex((p) => p.id === id);
        if (index === -1)
            throw new Error(`Program not found: ${id}`);
        if (input.cron && !cron.validate(input.cron)) {
            throw new Error(`Invalid cron expression: ${input.cron}`);
        }
        const program = { ...this.programs[index], ...input };
        this.programs[index] = program;
        this.save();
        this.unregisterJob(id);
        this.registerJob(program);
        return program;
    }
    deleteProgram(id) {
        const index = this.programs.findIndex((p) => p.id === id);
        if (index === -1)
            throw new Error(`Program not found: ${id}`);
        this.programs.splice(index, 1);
        this.save();
        this.unregisterJob(id);
    }
    stopAll() {
        for (const [, task] of this.cronJobs) {
            task.stop();
        }
        this.cronJobs.clear();
    }
    save() {
        const data = { programs: this.programs };
        fs.writeFileSync(this.schedulePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    }
    registerAllJobs() {
        this.stopAll();
        for (const program of this.programs) {
            this.registerJob(program);
        }
    }
    registerJob(program) {
        if (!program.enabled)
            return;
        if (!cron.validate(program.cron)) {
            console.error(`[ScheduleManager] Invalid cron expression for "${program.name}": ${program.cron}`);
            return;
        }
        const task = cron.schedule(program.cron, () => {
            console.log(`[ScheduleManager] Triggering program: ${program.name}`);
            this.streamManager.interrupt(program.tracks).catch((err) => {
                console.error(`[ScheduleManager] Interrupt failed for "${program.name}":`, err.message);
            });
        }, { timezone: 'Asia/Tokyo' });
        this.cronJobs.set(program.id, task);
    }
    unregisterJob(id) {
        const task = this.cronJobs.get(id);
        if (task) {
            task.stop();
            this.cronJobs.delete(id);
        }
    }
}
