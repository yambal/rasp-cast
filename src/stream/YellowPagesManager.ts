import http from 'node:http';
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
}

interface YPResponse {
  [key: string]: string;
}

export class YellowPagesManager {
  private ypId: string | null = null;
  private touchTimer: ReturnType<typeof setInterval> | null = null;
  private touchFreqMinutes = 5;
  private registered = false;

  constructor(
    private config: YPConfig,
    private streamManager: StreamManager,
  ) {}

  /** /addsrv でYPにステーション登録 */
  async register(): Promise<boolean> {
    const maxRetries = 3;
    const retryDelay = 30_000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const params = new URLSearchParams({
          v: '1',
          br: String(this.config.bitrate),
          p: String(this.config.port),
          m: String(this.config.maxListeners),
          t: this.config.stationName,
          g: this.config.genre,
          url: this.config.url,
          content: this.config.contentType,
          irc: '',
          icq: '0',
          aim: '',
        });

        const res = await this.ypRequest(`/addsrv?${params}`);

        if (res['icy-response'] === 'ack' && res['icy-id']) {
          this.ypId = res['icy-id'];
          this.registered = true;
          this.touchFreqMinutes = Number(res['icy-tchfrq']) || 5;
          console.log(`[YP] Registered: id=${this.ypId}, touchFreq=${this.touchFreqMinutes}min`);
          this.startTouching();
          return true;
        }

        const error = res['icy-error'] || 'unknown';
        console.warn(`[YP] Registration NAK (attempt ${attempt}/${maxRetries}): ${error}`);
      } catch (err: any) {
        console.warn(`[YP] Registration failed (attempt ${attempt}/${maxRetries}): ${err.message}`);
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    console.error('[YP] Registration failed after all retries');
    return false;
  }

  /** /tchsrv でトラック・リスナー情報を更新 */
  async touch(): Promise<void> {
    if (!this.registered || !this.ypId) return;

    try {
      const status = this.streamManager.getStatus();
      const currentTitle = this.streamManager.getCurrentTitle();

      const params = new URLSearchParams({
        id: this.ypId,
        p: String(this.config.port),
        li: String(status.listeners),
        alt: '0',
        ct: currentTitle,
      });

      const res = await this.ypRequest(`/tchsrv?${params}`);

      if (res['icy-response'] === 'ack') {
        const newFreq = Number(res['icy-tchfrq']);
        if (newFreq && newFreq !== this.touchFreqMinutes) {
          this.touchFreqMinutes = newFreq;
          this.startTouching();
          console.log(`[YP] Touch frequency updated: ${this.touchFreqMinutes}min`);
        }
      } else {
        const error = res['icy-error'] || 'unknown';
        console.warn(`[YP] Touch NAK: ${error}`);
        // NAKが返った場合は再登録を試みる
        this.registered = false;
        this.ypId = null;
        this.stopTouching();
        console.log('[YP] Re-registering after NAK...');
        this.register();
      }
    } catch (err: any) {
      console.warn(`[YP] Touch failed: ${err.message}`);
    }
  }

  /** /remsrv でステーション登録解除 */
  async remove(): Promise<void> {
    if (!this.registered || !this.ypId) return;

    try {
      const params = new URLSearchParams({
        id: this.ypId,
        p: String(this.config.port),
      });

      await this.ypRequest(`/remsrv?${params}`);
      console.log(`[YP] Removed: id=${this.ypId}`);
    } catch (err: any) {
      console.warn(`[YP] Remove failed: ${err.message}`);
    } finally {
      this.registered = false;
      this.ypId = null;
    }
  }

  /** タイマー停止 + 登録解除 */
  async stop(): Promise<void> {
    this.stopTouching();
    await this.remove();
  }

  /** 登録状態を返す */
  getStatus() {
    return {
      registered: this.registered,
      ypId: this.ypId,
      touchFreqMinutes: this.touchFreqMinutes,
      genre: this.config.genre,
    };
  }

  private startTouching(): void {
    this.stopTouching();
    const intervalMs = this.touchFreqMinutes * 60 * 1000;
    this.touchTimer = setInterval(() => this.touch(), intervalMs);
    console.log(`[YP] Touch timer started: every ${this.touchFreqMinutes}min`);
  }

  private stopTouching(): void {
    if (this.touchTimer) {
      clearInterval(this.touchTimer);
      this.touchTimer = null;
    }
  }

  /** YPサーバーへHTTP GETリクエストを送信し、icy-* レスポンスをパースして返す */
  private ypRequest(path: string): Promise<YPResponse> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        {
          hostname: this.config.host,
          port: 80,
          path,
          headers: {
            'Content-Type': 'shoutcast/crapola',
            'User-Agent': 'rasp-cast',
          },
          timeout: 15_000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            resolve(this.parseYPResponse(data));
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('YP request timeout'));
      });
    });
  }

  /** "icy-key: value" 形式のレスポンスをパース */
  private parseYPResponse(raw: string): YPResponse {
    const result: YPResponse = {};
    for (const line of raw.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  }
}
