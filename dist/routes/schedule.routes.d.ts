import { Router } from 'express';
import type { ScheduleManager } from '../schedule/ScheduleManager.js';
export declare function createScheduleRoutes(scheduleManager: ScheduleManager): Router;
