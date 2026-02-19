import fs from 'node:fs';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import type { StreamManager, PlaylistFileTrack } from '../stream/StreamManager.js';

interface ScheduledProgram {
  id: string;
  name: string;
  cron: string;
  tracks: PlaylistFileTrack[];
  enabled: boolean;
}

interface ScheduleFile {
  programs: ScheduledProgram[];
}

export type { ScheduledProgram };

export class ScheduleManager {
  private programs: ScheduledProgram[] = [];
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private schedulePath: string;
  private streamManager: StreamManager;

  constructor(schedulePath: string, streamManager: StreamManager) {
    this.schedulePath = schedulePath;
    this.streamManager = streamManager;
  }

  /** schedule.json を読み込み、有効なジョブを登録（旧 track → tracks 自動マイグレーション） */
  async load(): Promise<number> {
    if (fs.existsSync(this.schedulePath)) {
      try {
        const raw = fs.readFileSync(this.schedulePath, 'utf-8');
        const data = JSON.parse(raw);
        let needsSave = false;
        this.programs = ((data.programs || []) as any[]).map((p) => {
          // 旧形式: track (単一) → tracks (配列) に変換
          if (p.track && !p.tracks) {
            p.tracks = [p.track];
            delete p.track;
            needsSave = true;
          }
          // トラックにIDが無い場合、自動付与
          if (p.tracks) {
            for (const t of p.tracks) {
              if (!t.id) {
                t.id = crypto.randomUUID();
                needsSave = true;
              }
            }
          }
          return p as ScheduledProgram;
        });
        if (needsSave) {
          this.save();
          console.log('[ScheduleManager] Migrated schedule.json (assigned track IDs)');
        }
      } catch (err) {
        console.error('[ScheduleManager] Failed to parse schedule.json:', err);
        this.programs = [];
      }
    } else {
      this.programs = [];
    }

    // 既存プログラムのURLトラックを事前ダウンロード & cached フラグ更新
    let cacheUpdated = false;
    for (const program of this.programs) {
      if (await this.cacheUrlTracks(program.tracks)) cacheUpdated = true;
    }
    if (cacheUpdated) this.save();

    this.registerAllJobs();
    console.log(`[ScheduleManager] Loaded ${this.programs.length} programs (${this.cronJobs.size} active)`);
    return this.programs.length;
  }

  getPrograms(): ScheduledProgram[] {
    return this.programs;
  }

  getProgramsWithNextRun(): (ScheduledProgram & { nextRun: string | null })[] {
    return this.programs.map((p) => {
      let nextRun: string | null = null;
      if (p.enabled) {
        try {
          const interval = CronExpressionParser.parse(p.cron, {
            tz: 'Asia/Tokyo',
          });
          nextRun = interval.next().toISOString();
        } catch {
          // invalid cron
        }
      }
      return { ...p, nextRun };
    });
  }

  async addProgram(input: Omit<ScheduledProgram, 'id'>): Promise<ScheduledProgram> {
    if (!cron.validate(input.cron)) {
      throw new Error(`Invalid cron expression: ${input.cron}`);
    }

    // トラックにIDが無い場合、自動付与
    for (const t of input.tracks) {
      if (!t.id) t.id = crypto.randomUUID();
    }

    // 同じ cron 式の既存番組があれば上書き
    const existingIndex = this.programs.findIndex((p) => p.cron === input.cron);
    if (existingIndex !== -1) {
      const existing = this.programs[existingIndex];
      const program: ScheduledProgram = {
        id: existing.id,
        name: input.name,
        cron: input.cron,
        tracks: input.tracks,
        enabled: input.enabled !== undefined ? input.enabled : true,
      };
      // 旧URLトラックのキャッシュを削除
      this.deleteCacheForTracks(existing.tracks);
      // 新URLトラックを即時ダウンロード
      await this.cacheUrlTracks(program.tracks);

      this.programs[existingIndex] = program;
      this.save();
      this.unregisterJob(existing.id);
      this.registerJob(program);
      console.log(`[ScheduleManager] Overwritten program "${existing.name}" → "${program.name}" (same cron: ${input.cron})`);
      return program;
    }

    const program: ScheduledProgram = {
      id: crypto.randomUUID(),
      name: input.name,
      cron: input.cron,
      tracks: input.tracks,
      enabled: input.enabled !== undefined ? input.enabled : true,
    };

    // URLトラックを即時ダウンロード
    await this.cacheUrlTracks(program.tracks);

    this.programs.push(program);
    this.save();
    this.registerJob(program);
    return program;
  }

  async updateProgram(id: string, input: Partial<Omit<ScheduledProgram, 'id'>>): Promise<ScheduledProgram> {
    const index = this.programs.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Program not found: ${id}`);

    if (input.cron && !cron.validate(input.cron)) {
      throw new Error(`Invalid cron expression: ${input.cron}`);
    }

    // tracksが変更される場合、ID付与 → 旧キャッシュ削除 → 新キャッシュダウンロード
    if (input.tracks) {
      for (const t of input.tracks) {
        if (!t.id) t.id = crypto.randomUUID();
      }
      this.deleteCacheForTracks(this.programs[index].tracks);
      await this.cacheUrlTracks(input.tracks);
    }

    const program = { ...this.programs[index], ...input };
    this.programs[index] = program;
    this.save();

    this.unregisterJob(id);
    this.registerJob(program);

    return program;
  }

  deleteProgram(id: string): void {
    const index = this.programs.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Program not found: ${id}`);

    const program = this.programs[index];
    // URLトラックのキャッシュを即時削除
    this.deleteCacheForTracks(program.tracks);

    this.programs.splice(index, 1);
    this.save();
    this.unregisterJob(id);
    console.log(`[ScheduleManager] Deleted program "${program.name}" (${program.cron})`);
  }

  stopAll(): void {
    for (const [, task] of this.cronJobs) {
      task.stop();
    }
    this.cronJobs.clear();
  }

  private save(): void {
    const data: ScheduleFile = { programs: this.programs };
    fs.writeFileSync(this.schedulePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  private registerAllJobs(): void {
    this.stopAll();
    for (const program of this.programs) {
      this.registerJob(program);
    }
  }

  private registerJob(program: ScheduledProgram): void {
    if (!program.enabled) return;
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

  private unregisterJob(id: string): void {
    const task = this.cronJobs.get(id);
    if (task) {
      task.stop();
      this.cronJobs.delete(id);
    }
  }

  /** URLトラックを事前ダウンロード & cached フラグ更新。変更があれば true を返す */
  private async cacheUrlTracks(tracks: PlaylistFileTrack[]): Promise<boolean> {
    let changed = false;
    for (const track of tracks) {
      if (track.type === 'url' && track.url && track.id) {
        try {
          await this.streamManager.downloadToCache(track.url, track.id);
          if (!track.cached) { track.cached = true; changed = true; }
        } catch (err: any) {
          console.error(`[ScheduleManager] ⚠️  Failed to cache "${track.title}": ${err.message}`);
          if (track.cached) { track.cached = false; changed = true; }
        }
      }
    }
    return changed;
  }

  /** URLトラックのキャッシュを削除 & cached フラグ更新 */
  private deleteCacheForTracks(tracks: PlaylistFileTrack[]): void {
    for (const track of tracks) {
      if (track.type === 'url' && track.id) {
        this.streamManager.deleteCacheFile(track.id);
        track.cached = false;
      }
    }
  }
}
