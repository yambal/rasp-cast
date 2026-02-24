import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
import type { YellowPagesManager } from '../stream/YellowPagesManager.js';
export declare function createStreamRoutes(streamManager: StreamManager, scheduleManager?: ScheduleManager, ypManager?: YellowPagesManager | null): Router;
