import { AudioManager, PlaybackNotificationManager, RecordingNotificationManager } from 'react-native-audio-api';

import GocastEncoder from '../../modules/gocast-encoder/src/GocastEncoderModule';
import { AudioEngine } from '../audio/engine';
import { api, ApiError } from '../lib/api';

/**
 * The phone's port of the web studio's BroadcastManager
 * (client/lib/broadcast.ts): station → mic → engine → webcast socket, with the
 * same steps, timeouts, reconnect budget, drop accounting and metadata replay.
 * The web file carries the reasoning for every number here.
 *
 * Differences are platform only: AAC from the native encoder instead of MP3
 * from lamejs, a foreground service instead of a wake lock, and no tab
 * visibility handling, because a locked phone keeps running.
 */

export type BroadcastStep = 'station' | 'mic' | 'engine' | 'stream';
export type StepStatus = 'pending' | 'active' | 'done' | 'error';
export type BroadcastState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface BroadcastStartOptions {
  skipMic?: boolean;
  resumeFromStart?: boolean;
}

export interface BroadcastStepInfo {
  id: BroadcastStep;
  label: string;
  status: StepStatus;
  errorMessage?: string;
}

export interface TransportStats {
  bytesSent: number;
  chunksSent: number;
  chunksDropped: number;
  droppedMs: number;
  lastDropAt: number;
  connected: boolean;
}

interface BroadcastCallbacks {
  onStepChange: (steps: BroadcastStepInfo[]) => void;
  onStateChange: (state: BroadcastState) => void;
  onError: (message: string) => void;
}

/** AAC stereo. Roughly the quality of the web's 192k MP3. */
const BITRATE = 128_000;
const CHANNELS = 2;

const SOCKET_CONNECT_TIMEOUT_MS = 10000;
const HELLO_GRACE_MS = 600;
const STATION_READY_TIMEOUT_MS = 20000;
const STATION_READY_POLL_MS = 1000;
const RECONNECT_BUDGET_MS = 120000;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const RECONNECT_JITTER = 0.2;
const RECONNECT_STATION_READY_TIMEOUT_MS = 8000;

/**
 * Dev only: the API hands back a Docker bridge IP a phone cannot reach. See
 * mobile/.env and scripts/ingest-proxy.mjs.
 */
const INGEST_URL_OVERRIDE = process.env.EXPO_PUBLIC_INGEST_URL ?? '';

function reconnectDelay(attempt: number): number {
  const base = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
  const spread = base * RECONNECT_JITTER;
  return Math.round(base - spread + Math.random() * spread * 2);
}

export class BroadcastManager {
  private engine: AudioEngine | null = null;
  private ws: WebSocket | null = null;
  private steps: BroadcastStepInfo[] = [];
  private stopping = false;
  private established = false;
  private reconnecting = false;
  private encoderStarted = false;
  private notification: 'recording' | 'playback' | null = null;

  private bytesSent = 0;
  private chunksSent = 0;
  private chunksDropped = 0;
  private droppedMs = 0;
  private lastDropAt = 0;
  private dropRunStart = 0;
  private countersArmed = false;
  private wakeFromBackoff: (() => void) | null = null;

  private lastMetadata: { title: string; artist: string } | null = null;
  private sentMetadataKey: string | null = null;

  constructor(
    private stationSlug: string,
    private stationName: string,
    private callbacks: BroadcastCallbacks,
  ) {}

  private static buildSteps(skipMic?: boolean): BroadcastStepInfo[] {
    const steps: BroadcastStepInfo[] = [{ id: 'station', label: 'Bringing your station on air', status: 'pending' }];
    if (!skipMic) steps.push({ id: 'mic', label: 'Requesting microphone access', status: 'pending' });
    steps.push(
      { id: 'engine', label: 'Setting up audio engine', status: 'pending' },
      { id: 'stream', label: 'Connecting to stream server', status: 'pending' },
    );
    return steps;
  }

  private updateStep(id: BroadcastStep, status: StepStatus, errorMessage?: string) {
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, status, errorMessage } : s));
    this.callbacks.onStepChange([...this.steps]);
  }

  private setActiveStep(id: BroadcastStep) {
    this.updateStep(id, 'active');
  }

  async start(options?: BroadcastStartOptions): Promise<void> {
    this.stopping = false;
    this.established = false;
    this.reconnecting = false;
    this.lastMetadata = null;
    this.sentMetadataKey = null;
    this.steps = BroadcastManager.buildSteps(options?.skipMic);
    this.callbacks.onStateChange('connecting');
    this.callbacks.onStepChange([...this.steps]);

    try {
      this.setActiveStep('station');
      await this.ensureStationOnAir();
      this.updateStep('station', 'done');

      if (!options?.skipMic) {
        this.setActiveStep('mic');
        if ((await AudioManager.requestRecordingPermissions()) !== 'Granted') {
          throw new MicPermissionError('Microphone access denied — allow it in the phone’s settings for GoCast');
        }
        this.updateStep('mic', 'done');
      }

      this.setActiveStep('engine');
      await this.startForegroundService(!options?.skipMic);
      this.engine = await AudioEngine.create(!options?.skipMic, (left, right) => this.onPcm(left, right));
      this.engine.subscribe(() => {
        const track = this.engine?.getCurrentTrack();
        if (!track || `${track.title}\0${track.artist}` === this.sentMetadataKey) return;
        this.sendMetadata(track.title, track.artist);
      });
      await this.engine.restoreQueue();
      this.updateStep('engine', 'done');

      this.setActiveStep('stream');
      await this.connectWebcast();
      this.updateStep('stream', 'done');

      void this.engine.resumePlayback({ fromStart: options?.resumeFromStart }).catch((err) => {
        console.error('[BroadcastManager] could not resume saved playback:', err);
      });

      this.callbacks.onStateChange('live');
    } catch (err) {
      await this.fail(err);
    }
  }

  /**
   * The notification IS the Android foreground service that keeps the show
   * running with the screen locked. It must start while the app is in front
   * and before the mic opens: Android 14 refuses to start a microphone
   * service from the background. Music-only shows use the playback type,
   * which does not need the mic permission.
   */
  private async startForegroundService(withMic: boolean) {
    // Android 13+ hides the notification without this; the service still runs.
    await AudioManager.requestNotificationPermissions().catch(() => {});
    if (withMic) {
      await RecordingNotificationManager.show({
        title: `Live on ${this.stationName}`,
        contentText: 'GoCast is broadcasting',
        usesChronometer: true,
        showStopAction: false,
        paused: false,
      });
      this.notification = 'recording';
    } else {
      await PlaybackNotificationManager.show({
        title: `Live on ${this.stationName}`,
        artist: 'GoCast is broadcasting',
        state: 'playing',
      });
      this.notification = 'playback';
    }
  }

  private async stopForegroundService() {
    if (this.notification === 'recording') await RecordingNotificationManager.hide().catch(() => {});
    if (this.notification === 'playback') await PlaybackNotificationManager.hide().catch(() => {});
    this.notification = null;
  }

  /**
   * 100ms of the mix, from the engine's tap. Encoded frames go out if the
   * socket is open and are dropped otherwise: buffering would replay stale
   * audio into a live show when a reconnect lands.
   */
  private onPcm(left: Float32Array, right: Float32Array | null) {
    if (!this.engine) return;
    if (!this.encoderStarted) {
      GocastEncoder.start(this.engine.sampleRate, CHANNELS, BITRATE);
      this.encoderStarted = true;
    }
    const chunk = GocastEncoder.encode(left, right);
    if (chunk.byteLength === 0) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
      if (!this.countersArmed) return;
      this.bytesSent += chunk.byteLength;
      this.chunksSent++;
      if (this.dropRunStart !== 0) {
        this.droppedMs += Date.now() - this.dropRunStart;
        this.dropRunStart = 0;
      }
    } else {
      if (!this.countersArmed) return;
      const now = Date.now();
      if (this.dropRunStart === 0) this.dropRunStart = now;
      this.lastDropAt = now;
      this.chunksDropped++;
    }
  }

  private async ensureStationOnAir(readyTimeoutMs = STATION_READY_TIMEOUT_MS): Promise<void> {
    try {
      await api(`/stations/${this.stationSlug}/start`, { method: 'POST' });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 422 || err.status === 403)) {
        throw new Error(err.message || 'This station cannot go on air right now');
      }
      throw new Error('Could not bring the station on air — please try again');
    }

    const deadline = Date.now() + readyTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const { data } = await api<{ data: { ready: boolean } }>(`/stations/${this.stationSlug}/status`);
        if (data.ready) return;
      } catch {
        // A blip reading the container is not a reason to abandon the broadcast.
      }
      await new Promise((resolve) => setTimeout(resolve, STATION_READY_POLL_MS));
    }
  }

  private async connectWebcast(): Promise<void> {
    if (!this.engine) throw new Error('Audio engine not initialized');

    let token: string;
    let ingestUrl: string;
    try {
      const resp = await api<{ token: string; ingest_url: string }>('/auth/broadcast-token', {
        method: 'POST',
        body: { station_slug: this.stationSlug },
      });
      token = resp.token;
      ingestUrl = INGEST_URL_OVERRIDE ? INGEST_URL_OVERRIDE.replace('{slug}', this.stationSlug) : resp.ingest_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) throw new Error('You do not own this station');
      throw new Error('Not signed in — please sign in and try again');
    }
    if (!ingestUrl) throw new Error('The server did not return a publish address for this station');

    const ws = await this.openSocket(ingestUrl, token);
    this.established = true;
    this.countersArmed = true;
    this.watchForDrop(ws);
  }

  private openSocket(url: string, token: string): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url, 'webcast');
      } catch {
        return reject(new Error('Could not reach the stream server'));
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      let settled = false;
      let helloTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimer);
        if (helloTimer) clearTimeout(helloTimer);
        fn();
      };

      const connectTimer = setTimeout(() => {
        finish(() => {
          try {
            ws.close();
          } catch {}
          reject(new Error('Timed out connecting to the stream server'));
        });
      }, SOCKET_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'hello',
            data: {
              mime: 'audio/aac',
              user: this.stationSlug,
              password: token,
              audio: {
                channels: CHANNELS,
                samplerate: this.engine?.sampleRate ?? 44100,
                bitrate: BITRATE / 1000,
                encoder: 'aac',
              },
            },
          }),
        );
        helloTimer = setTimeout(() => finish(() => resolve(ws)), HELLO_GRACE_MS);
      };
      ws.onerror = () => {
        finish(() => reject(new Error('Could not reach the stream server')));
      };
      ws.onclose = (event) => {
        finish(() =>
          reject(
            new Error(
              event.code === 1008 || event.code === 4001
                ? 'The stream server rejected this broadcast — the previous connection may still be closing'
                : 'The stream server closed the connection before the broadcast started',
            ),
          ),
        );
      };
    });
  }

  private watchForDrop(ws: WebSocket) {
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.stopping || !this.established) return;
      this.established = false;
      void this.reconnect();
    };
    ws.onerror = () => {};
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    this.callbacks.onStateChange('reconnecting');
    this.callbacks.onError('');

    const deadline = Date.now() + RECONNECT_BUDGET_MS;
    let attempt = 0;
    let lastError: unknown = null;

    while (!this.stopping && Date.now() < deadline) {
      await this.backoff(reconnectDelay(attempt));
      attempt++;
      if (this.stopping) break;
      try {
        await this.ensureStationOnAir(RECONNECT_STATION_READY_TIMEOUT_MS);
        if (this.stopping) break;
        await this.connectWebcast();
        if (this.stopping) {
          this.established = false;
          try {
            this.ws?.close(1000, 'broadcast ended');
          } catch {}
          this.ws = null;
          break;
        }
        this.reconnecting = false;
        if (this.lastMetadata) this.sendMetadata(this.lastMetadata.title, this.lastMetadata.artist);
        this.callbacks.onError('');
        this.callbacks.onStateChange('live');
        return;
      } catch (err) {
        lastError = err;
      }
    }

    this.reconnecting = false;
    if (this.stopping) return;
    const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
    await this.fail(new Error(`Lost the connection to the stream server and couldn't get back on air${detail}`));
  }

  private backoff(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakeFromBackoff = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakeFromBackoff = done;
    });
  }

  private sendMetadata(title: string, artist: string): void {
    this.lastMetadata = { title, artist };
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'metadata', data: { title, artist } }));
    this.sentMetadataKey = `${title}\0${artist}`;
  }

  getTransportStats(): TransportStats {
    const openRun = this.dropRunStart === 0 ? 0 : Date.now() - this.dropRunStart;
    return {
      bytesSent: this.bytesSent,
      chunksSent: this.chunksSent,
      chunksDropped: this.chunksDropped,
      droppedMs: this.droppedMs + openRun,
      lastDropAt: this.lastDropAt,
      connected: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  getEngine(): AudioEngine | null {
    return this.engine;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wakeFromBackoff?.();
    this.reconnecting = false;
    this.established = false;
    try {
      this.ws?.close(1000, 'broadcast ended');
    } catch {}
    this.ws = null;
    await this.teardownAudio();
    this.lastMetadata = null;
    this.sentMetadataKey = null;
    this.callbacks.onStateChange('idle');
  }

  private async teardownAudio() {
    const engine = this.engine;
    this.engine = null;
    await engine?.destroy().catch(() => {});
    if (this.encoderStarted) GocastEncoder.stop();
    this.encoderStarted = false;
    await this.stopForegroundService();
  }

  private async fail(err: unknown) {
    const activeStep = this.steps.find((s) => s.status === 'active');
    const message = err instanceof Error ? err.message : 'Something went wrong';
    if (activeStep) this.updateStep(activeStep.id, 'error', message);

    this.reconnecting = false;
    this.established = false;
    this.callbacks.onError(message);
    this.callbacks.onStateChange('error');

    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    await this.teardownAudio();
  }
}

/** Thrown when the mic permission is refused, so the UI can offer music only. */
export class MicPermissionError extends Error {}
