import { Router } from 'express';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
import type { StreamManager } from '../stream/StreamManager.js';
export declare function createScheduleRoutes(scheduleManager: ScheduleManager, streamManager: StreamManager): Router;
