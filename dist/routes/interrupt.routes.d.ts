import { Router } from 'express';
import type { StreamManager } from '../stream/StreamManager.js';
export declare function createInterruptRoutes(streamManager: StreamManager): Router;
