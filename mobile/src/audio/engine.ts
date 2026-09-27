import {
  AnalyserNode,
  AudioContext,
  AudioManager,
  AudioRecorder,
  BiquadFilterNode,
  GainNode,
  getAudioDuration,
  type RecorderAdapterNode,
  type WorkletNode,
  type WorkletProcessingNode,
} from 'react-native-audio-api';
import { scheduleOnRN } from 'react-native-worklets';

import { FileSource } from './fileSource';
import {
  DUCK_GAIN,
  FADE_TIME_CONSTANT,
  INPUT_GAIN_MAX_DB,
  INPUT_GAIN_MIN_DB,
  loadMicPrefs,
  saveMicPrefs,
  type MicPrefs,
} from './micPrefs';
import {
  clearQueue as clearStoredQueue,
  importPickedFile,
  loadPlayback,
  loadQueue,
  pruneFiles,
  savePlayback,
  saveQueue,
  trackPath,
  type StoredTrack,
} from './queueStore';
import { readTags } from './tags';

/**
 * The phone studio's mixer: a port of the web studio's AudioEngine
 * (client/lib/audioEngine.ts). Behaviour, gains and time constants are the
 * web's; comments there explain the reasoning behind each, and are not
 * repeated here. What differs is plumbing only:
 *
 *   file source → fileGain ─────────────────────────────┐
 *                 fileGain → monitorGain → speakers      ├→ mixer → tap ──► onPcm (JS) → AAC encoder (+ limiter)
 *   mic → micTrim ─┬→ micDry ─────────────────────────────→ micGain ─┘
 *                  └→ highpass → presence → voiceComp → micWet ─┘
 *
 * - micTrim is phone-only: a phone mic arrives ~30 dB quieter than the laptop
 *   mic the web chain was tuned for. See MicPrefs.inputGainDb.
 *
 * - The master limiter runs in the native encoder (no DynamicsCompressorNode
 *   here); the voice compressor is a worklet on the audio thread.
 * - `tap` is a WorkletNode: it passes audio through and hands each 100ms of
 *   the mix to JS. Everything that must be processed but not heard hangs off
 *   `sink`, a zero-gain path to the destination, because the graph is pulled
 *   from the speakers.
 * - Tracks stream from files in app storage through FFmpeg, not from blobs.
 * - Every node is created with channelCountMode 'explicit'. This library
 *   hands a node's own buffer straight to its consumers, and gain nodes
 *   multiply that buffer in place, so wherever one node feeds two (fileGain →
 *   mixer and monitor; the mic into its dry, processed and meter paths) the
 *   branches overwrite each other: the monitor at 0 silenced the broadcast.
 *   An explicit node mixes its inputs into a buffer of its own instead.
 */

export interface QueueTrack extends StoredTrack {
  duration: number;
}

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string | null;
}

export interface AddFilesResult {
  added: number;
  skipped: PickedFile[];
  overLimit: boolean;
}

export type RepeatMode = 'all' | 'one';

const MIC_BOOST = 3;
const STEREO = { channelCount: 2, channelCountMode: 'explicit' } as const;
const MONO = { channelCount: 1, channelCountMode: 'explicit' } as const;
/**
 * The phone's own output rate (48 kHz on most Android phones). The web pins
 * 44.1 kHz only because lamejs is built for one rate; the AAC encoder takes
 * whatever the context runs at, and matching the hardware saves resampling on
 * the way to the speaker and on the way in from the mic.
 */
function preferredSampleRate(): number {
  const rate = AudioManager.getDevicePreferredSampleRate();
  return rate === 44100 || rate === 48000 ? rate : 48000;
}
export const QUEUE_BYTE_LIMIT = 2 * 1024 * 1024 * 1024;
const MONITOR_DEFAULT_VOLUME = 0.62;
/** How long removed tracks' files survive, so Undo (6s in the UI) has them. */
const PRUNE_DELAY_MS = 15_000;

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AudioEngine {
  private ctx: AudioContext;
  private mixer: GainNode;
  private fileGain: GainNode;
  private micGain: GainNode;
  private micDry: GainNode;
  private micWet: GainNode;
  private monitorGain: GainNode;
  private sink: GainNode;
  private tap: WorkletNode;
  private micPrefs: MicPrefs = loadMicPrefs();

  private recorder: AudioRecorder | null = null;
  private micAdapter: RecorderAdapterNode | null = null;
  private micTrim: GainNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micNodes: (BiquadFilterNode | WorkletProcessingNode)[] = [];

  private monitorEnabled = false;
  private monitorVolume = MONITOR_DEFAULT_VOLUME;
  private isTalking = false;
  private micLatched = false;
  private repeatMode: RepeatMode = 'all';

  private queue: QueueTrack[] = [];
  private currentIndex = -1;
  private playing = false;
  private currentSource: FileSource | null = null;
  private progressTimer: ReturnType<typeof setInterval>;
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;

  private listeners = new Set<() => void>();
  private version = 0;

  private constructor(private onPcm: (left: Float32Array, right: Float32Array | null) => void) {
    this.ctx = new AudioContext({ sampleRate: preferredSampleRate() });

    this.sink = new GainNode(this.ctx, { ...STEREO, gain: 0 });
    this.sink.connect(this.ctx.destination);

    this.mixer = new GainNode(this.ctx, { ...STEREO, gain: 1 });

    // JS-side receiver for the tap. A plain function: scheduleOnRN runs it on
    // the React Native runtime with copies of the worklet's buffers.
    const deliver = (left: Float32Array, right: Float32Array | null) => this.onPcm(left, right);
    this.tap = this.ctx.createWorkletNode(
      (audioData: Float32Array[], channelCount: number) => {
        'worklet';
        scheduleOnRN(deliver, audioData[0], channelCount > 1 ? audioData[1] : null);
      },
      // 100ms of the mix per hand-off to JS.
      Math.round(this.ctx.sampleRate / 10),
      2,
      'AudioRuntime',
    );
    this.mixer.connect(this.tap);
    this.tap.connect(this.sink);

    this.fileGain = new GainNode(this.ctx, { ...STEREO, gain: 1 });
    this.fileGain.connect(this.mixer);

    this.micGain = new GainNode(this.ctx, { ...STEREO, gain: 0 });
    this.micGain.connect(this.mixer);

    this.micDry = new GainNode(this.ctx, { ...MONO, gain: this.micPrefs.broadcastVoice ? 0 : 1 });
    this.micWet = new GainNode(this.ctx, { ...MONO, gain: this.micPrefs.broadcastVoice ? 1 : 0 });
    this.micDry.connect(this.micGain);
    this.micWet.connect(this.micGain);

    this.monitorGain = new GainNode(this.ctx, { ...STEREO, gain: 0 });
    this.fileGain.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);

    this.progressTimer = setInterval(() => this.saveProgress(), 5000);
  }

  /**
   * Build the engine. With `withMic`, the recorder must already be allowed
   * (the caller asked for the permission) and starts here.
   */
  static async create(
    withMic: boolean,
    onPcm: (left: Float32Array, right: Float32Array | null) => void,
  ): Promise<AudioEngine> {
    const engine = new AudioEngine(onPcm);
    if (withMic) await engine.startMic();
    await engine.ctx.resume();
    return engine;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  private async startMic() {
    const recorder = new AudioRecorder();
    const adapter = this.ctx.createRecorderAdapter();
    recorder.connect(adapter);

    const trim = new GainNode(this.ctx, { ...MONO, gain: dbToGain(this.micPrefs.inputGainDb) });
    adapter.connect(trim);
    trim.connect(this.micDry);

    // Broadcast voice chain: the web's highpass → presence → compressor.
    const highpass = new BiquadFilterNode(this.ctx, { ...MONO, type: 'highpass', frequency: 80, Q: 0.707 });
    const presence = new BiquadFilterNode(this.ctx, { ...MONO, type: 'peaking', frequency: 3000, Q: 1, gain: 3 });

    const comp = this.createVoiceCompressor();

    trim.connect(highpass);
    highpass.connect(presence);
    presence.connect(comp);
    comp.connect(this.micWet);
    this.micNodes = [highpass, presence, comp];

    // Meter tap after the trim but before the talk gain, so levels show while
    // the mic is closed (as on the web) and reflect the trim being set.
    this.micAnalyser = new AnalyserNode(this.ctx, { ...MONO, fftSize: 1024 });
    trim.connect(this.micAnalyser);
    this.micAnalyser.connect(this.sink);

    const result = await recorder.start();
    if (result.status === 'error') throw new Error(`Could not start the microphone: ${result.message}`);
    this.recorder = recorder;
    this.micAdapter = adapter;
    this.micTrim = trim;
  }

  /**
   * The web's voice compressor (threshold −20, knee 6, ratio 3, attack 5ms,
   * release 150ms, Web Audio's automatic makeup) as an audio-thread worklet.
   * State lives on the worklet runtime's global, which persists between
   * render quanta; captured variables do not.
   */
  private createVoiceCompressor(): WorkletProcessingNode {
    const rate = this.ctx.sampleRate;
    // Gain is recomputed every BLOCK samples (~0.3ms): the log/pow per sample
    // was enough to make the audio thread late on a phone, which the speaker
    // monitor hears as stutter. The envelope still follows every sample.
    const BLOCK = 16;
    const attack = Math.exp(-BLOCK / (0.005 * rate));
    const release = Math.exp(-BLOCK / (0.15 * rate));
    return this.ctx.createWorkletProcessingNode((input: Float32Array[], output: Float32Array[], frames: number) => {
      'worklet';
      const threshold = -20;
      const knee = 6;
      const ratio = 3;
      const slope = 1 - 1 / ratio;
      // (1 / gain at 0 dBFS)^0.6: 20 dB over the threshold is reduced by
      // 13.3 dB, so the makeup is 0.6 × 13.3 ≈ 8 dB.
      const makeupDb = 0.6 * (-threshold * slope);
      const g = globalThis as unknown as { __gocastVoiceComp?: { reduction: number } };
      const state = g.__gocastVoiceComp ?? (g.__gocastVoiceComp = { reduction: 0 });
      let reduction = state.reduction;
      const channels = Math.min(input.length, output.length);
      for (let start = 0; start < frames; start += BLOCK) {
        const end = Math.min(start + BLOCK, frames);
        let peak = 0;
        for (let c = 0; c < channels; c++) {
          const inp = input[c];
          for (let i = start; i < end; i++) {
            const v = inp[i] < 0 ? -inp[i] : inp[i];
            if (v > peak) peak = v;
          }
        }
        const level = peak > 1e-6 ? 20 * Math.log10(peak) : -120;
        const over = level - threshold;
        let target = 0;
        if (2 * over > knee) target = over * slope;
        else if (2 * over > -knee) target = (slope * (over + knee / 2) * (over + knee / 2)) / (2 * knee);
        const coef = target > reduction ? attack : release;
        reduction = coef * reduction + (1 - coef) * target;
        const gain = Math.pow(10, (makeupDb - reduction) / 20);
        for (let c = 0; c < channels; c++) {
          const inp = input[c];
          const out = output[c];
          for (let i = start; i < end; i++) out[i] = inp[i] * gain;
        }
      }
      state.reduction = reduction;
    }, 'AudioRuntime');
  }

  hasMic(): boolean {
    return this.recorder !== null;
  }

  /** Raw mic peak in dBFS for the meter, or null without a mic. */
  readMicPeakDb(): number | null {
    if (!this.micAnalyser) return null;
    const data = new Float32Array(this.micAnalyser.fftSize);
    this.micAnalyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  }

  // ── PTT ──

  pttDown() {
    if (this.isTalking) return;
    this.isTalking = true;
    this.applyFileGain();
    this.micGain.gain.setTargetAtTime(MIC_BOOST, this.ctx.currentTime, 0.02);
    this.notify();
  }

  pttUp() {
    if (this.micLatched) return;
    if (!this.isTalking) return;
    this.isTalking = false;
    this.applyFileGain();
    this.micGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.notify();
  }

  private applyFileGain() {
    const target = this.isTalking ? DUCK_GAIN[this.micPrefs.duck] : 1;
    const param = this.fileGain.gain;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(target, now, FADE_TIME_CONSTANT[this.micPrefs.fade]);
  }

  // ── Mic settings ──

  getMicPrefs(): MicPrefs {
    return this.micPrefs;
  }

  setMicPrefs(patch: Partial<MicPrefs>) {
    const next = { ...this.micPrefs, ...patch };
    next.inputGainDb = Math.min(INPUT_GAIN_MAX_DB, Math.max(INPUT_GAIN_MIN_DB, next.inputGainDb));
    if (
      next.duck === this.micPrefs.duck &&
      next.fade === this.micPrefs.fade &&
      next.broadcastVoice === this.micPrefs.broadcastVoice &&
      next.inputGainDb === this.micPrefs.inputGainDb
    )
      return;
    const voiceChanged = next.broadcastVoice !== this.micPrefs.broadcastVoice;
    this.micPrefs = next;
    saveMicPrefs(next);
    if (this.isTalking) this.applyFileGain();
    if (this.micTrim) this.micTrim.gain.setTargetAtTime(dbToGain(next.inputGainDb), this.ctx.currentTime, 0.05);
    if (voiceChanged) {
      const now = this.ctx.currentTime;
      this.micWet.gain.setTargetAtTime(next.broadcastVoice ? 1 : 0, now, 0.02);
      this.micDry.gain.setTargetAtTime(next.broadcastVoice ? 0 : 1, now, 0.02);
    }
    this.notify();
  }

  isMicActive(): boolean {
    return this.isTalking;
  }

  isMicLatched(): boolean {
    return this.micLatched;
  }

  setMicLatched(latched: boolean) {
    if (this.micLatched === latched) return;
    this.micLatched = latched;
    if (latched) this.pttDown();
    else this.pttUp();
    this.notify();
  }

  // ── Monitor ──

  isMonitorEnabled(): boolean {
    return this.monitorEnabled;
  }

  getMonitorVolume(): number {
    return this.monitorVolume;
  }

  setMonitorEnabled(enabled: boolean) {
    if (this.monitorEnabled === enabled) return;
    this.monitorEnabled = enabled;
    this.applyMonitorGain();
    this.notify();
  }

  setMonitorVolume(volume: number) {
    const clamped = Math.min(1, Math.max(0, volume));
    if (this.monitorVolume === clamped) return;
    this.monitorVolume = clamped;
    this.applyMonitorGain();
    this.notify();
  }

  private applyMonitorGain() {
    const target = this.monitorEnabled ? this.monitorVolume : 0;
    this.monitorGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  // ── Repeat ──

  getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }

  setRepeatMode(mode: RepeatMode) {
    if (this.repeatMode === mode) return;
    this.repeatMode = mode;
    this.notify();
  }

  // ── Queue ──

  getQueue(): QueueTrack[] {
    return this.queue;
  }

  getQueueBytes(): number {
    return this.queue.reduce((sum, t) => sum + t.size, 0);
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTrack(): QueueTrack | null {
    return this.queue[this.currentIndex] ?? null;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = (): number => this.version;

  private notify() {
    this.version++;
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[AudioEngine] listener threw:', err);
      }
    });
  }

  private persistQueue() {
    saveQueue(this.queue.map(({ duration: _duration, ...stored }) => stored));
    // Files of removed tracks go once Undo can no longer want them.
    if (this.pruneTimer) clearTimeout(this.pruneTimer);
    this.pruneTimer = setTimeout(() => pruneFiles(new Set(this.queue.map((t) => t.fileName))), PRUNE_DELAY_MS);
  }

  private saveProgress() {
    if (this.playing && this.currentIndex >= 0 && this.currentSource) {
      savePlayback({ currentIndex: this.currentIndex, offset: this.getElapsed() });
    }
  }

  /** Reload the saved queue. Does not start playback; see {@link resumePlayback}. */
  async restoreQueue(): Promise<void> {
    const stored = loadQueue();
    if (stored.length === 0) return;
    const restored = stored.map((track) => ({ ...track, duration: 0 }));
    this.queue.push(...restored);
    this.notify();
    void this.fillDurations(restored);
  }

  private async fillDurations(tracks: QueueTrack[]) {
    let changed = false;
    for (const track of tracks) {
      if (track.duration || !this.queue.includes(track)) continue;
      const duration = await getAudioDuration(trackPath(track)).catch(() => 0);
      if (duration > 0 && !track.duration) {
        track.duration = duration;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  async resumePlayback(options?: { fromStart?: boolean }): Promise<void> {
    const playback = loadPlayback();
    if (!playback) return;
    if (playback.currentIndex < 0 || playback.currentIndex >= this.queue.length) return;
    const offset = options?.fromStart ? 0 : Math.max(0, playback.offset);
    this.playIndexAtOffset(playback.currentIndex, offset);
  }

  /** Copy picked files into the queue, stopping at {@link QUEUE_BYTE_LIMIT}. */
  async addFiles(files: PickedFile[]): Promise<AddFilesResult> {
    const skipped: PickedFile[] = [];
    let added = 0;
    let currentBytes = this.getQueueBytes();

    for (const file of files) {
      if (file.mimeType && !file.mimeType.startsWith('audio/')) continue;
      if (currentBytes + file.size > QUEUE_BYTE_LIMIT) {
        skipped.push(file);
        continue;
      }
      const id = newId();
      let fileName: string;
      try {
        fileName = importPickedFile(file.uri, id, file.name);
      } catch (err) {
        console.error('[AudioEngine] could not import', file.name, err);
        skipped.push(file);
        continue;
      }
      const stored = { id, fileName, originalName: file.name, size: file.size };
      const [duration, tags] = await Promise.all([
        getAudioDuration(trackPath(stored)).catch(() => 0),
        readTags(trackPath(stored), file.name),
      ]);
      this.queue.push({ ...stored, ...tags, duration });
      currentBytes += file.size;
      added++;
    }
    if (added > 0) {
      this.persistQueue();
      this.notify();
      if (!this.playing && this.queue.length > 0 && this.currentIndex === -1) {
        this.playIndex(0);
      }
    }
    return { added, skipped, overLimit: skipped.length > 0 };
  }

  removeTrack(id: string) {
    const idx = this.queue.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (idx === this.currentIndex) {
      this.stopCurrent();
      this.queue.splice(idx, 1);
      if (this.queue.length > 0) {
        this.playIndex(Math.min(idx, this.queue.length - 1));
      } else {
        this.currentIndex = -1;
        this.playing = false;
      }
    } else {
      this.queue.splice(idx, 1);
      if (idx < this.currentIndex) this.currentIndex--;
    }
    this.persistQueue();
    this.notify();
  }

  moveTrack(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    const [moved] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, moved);
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
      this.currentIndex++;
    }
    this.persistQueue();
    this.notify();
  }

  clearUpcoming(): QueueTrack[] {
    const current = this.queue[this.currentIndex] ?? null;
    const removed = this.queue.filter((t) => t !== current);
    if (removed.length === 0) return [];
    this.queue = current ? [current] : [];
    this.currentIndex = current ? 0 : -1;
    this.persistQueue();
    this.notify();
    return removed;
  }

  restoreTracks(tracks: QueueTrack[], order: string[]) {
    const present = new Set(this.queue.map((t) => t.id));
    const incoming = tracks.filter((t) => !present.has(t.id));
    if (incoming.length === 0) return;
    const current = this.queue[this.currentIndex] ?? null;
    const rank = new Map(order.map((id, i) => [id, i]));
    const merged = [...this.queue, ...incoming];
    merged.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    this.queue = merged;
    this.currentIndex = current ? this.queue.indexOf(current) : -1;
    this.persistQueue();
    this.notify();
  }

  clearQueue() {
    this.stopCurrent();
    this.queue = [];
    this.currentIndex = -1;
    this.playing = false;
    clearStoredQueue();
    this.notify();
  }

  // ── Playback ──

  play() {
    if (this.queue.length === 0) return;
    if (this.currentIndex === -1) {
      this.playIndex(0);
    } else if (!this.playing) {
      if (this.currentSource) {
        this.currentSource.play();
        this.playing = true;
        this.notify();
      } else {
        this.playIndex(this.currentIndex);
      }
    }
  }

  pause() {
    if (!this.playing) return;
    this.currentSource?.pause();
    this.playing = false;
    this.notify();
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  next() {
    if (this.queue.length === 0) return;
    const nextIdx = this.currentIndex + 1;
    this.playIndex(nextIdx < this.queue.length ? nextIdx : 0);
  }

  prev() {
    if (this.queue.length === 0) return;
    const prevIdx = this.currentIndex - 1;
    this.playIndex(prevIdx >= 0 ? prevIdx : this.queue.length - 1);
  }

  getElapsed(): number {
    return this.currentSource?.currentTime ?? 0;
  }

  private playIndex(index: number) {
    this.playIndexAtOffset(index, 0);
  }

  private playIndexAtOffset(index: number, offset: number) {
    this.stopCurrent();
    this.currentIndex = index;
    const track = this.queue[index];
    if (!track) return;

    const source = FileSource.open(this.ctx, trackPath(track), () => {
      // Ignore ended events from a superseded source (track switch in flight).
      if (this.currentSource !== source) return;
      if (this.repeatMode === 'one') this.playIndex(this.currentIndex);
      else this.next();
    });
    if (!source) {
      console.error('[AudioEngine] could not open', track.originalName);
      this.notify();
      return;
    }
    source.output.connect(this.fileGain);
    this.currentSource = source;

    const duration = source.duration;
    if (Number.isFinite(duration) && duration > 0) {
      if (!track.duration || Math.abs(track.duration - duration) > 0.5) track.duration = duration;
      if (offset > 0) source.seekTo(Math.min(offset, Math.max(0, duration - 0.1)));
    }
    source.play();
    this.playing = true;
    savePlayback({ currentIndex: index, offset });
    this.notify();
  }

  private stopCurrent() {
    const source = this.currentSource;
    this.currentSource = null;
    source?.dispose();
  }

  async destroy(): Promise<void> {
    clearInterval(this.progressTimer);
    this.saveProgress();
    if (this.pruneTimer) clearTimeout(this.pruneTimer);
    this.stopCurrent();
    if (this.recorder) {
      this.recorder.disconnect();
      if (this.recorder.isRecording()) await this.recorder.stop().catch(() => {});
    }
    this.micAdapter?.disconnect();
    this.micTrim?.disconnect();
    this.micAnalyser?.disconnect();
    this.micNodes.forEach((n) => n.disconnect());
    this.tap.disconnect();
    await this.ctx.close().catch(() => {});
  }
}
