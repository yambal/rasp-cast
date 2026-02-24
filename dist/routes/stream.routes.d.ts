import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
export declare function createStreamRoutes(streamManager: StreamManager, scheduleManager?: ScheduleManager): Router;
