import { AudioNode, type AudioContext } from 'react-native-audio-api';

/**
 * One queued track streaming from a file, routed into our graph.
 *
 * react-native-audio-api's FFmpeg file source is what its <Audio> tag plays
 * through, but the class wrapping it is not part of the package's public
 * API. This is the handful of calls the studio needs, made directly on the
 * native object: open, route through a media-element node (which takes it off
 * its default path straight to the speakers), play, pause, seek, and "ended".
 */

interface NativeFileSource {
  readonly duration: number;
  readonly currentTime: number;
  onEnded: string;
  start(when: number): void;
  pause(): void;
  seekToTime(seconds: number): void;
  disconnect(destination?: unknown): void;
}

interface NativeContext {
  createFileSource(options: {
    source: string;
    loop: boolean;
    volume: number;
    playbackRate: number;
    preservesPitch: boolean;
  }): NativeFileSource | null;
  createMediaElementSource(source: NativeFileSource): unknown;
}

interface NativeEventEmitter {
  addAudioEventListener(name: string, callback: () => void): string;
  removeAudioEventListener(name: string, subscriptionId: string): void;
}

export class FileSource {
  private route: AudioNode;
  private endedSubscription: string;

  private constructor(
    private ctx: AudioContext,
    private node: NativeFileSource,
    onEnded: () => void,
  ) {
    const emitter = (globalThis as unknown as { AudioEventEmitter: NativeEventEmitter }).AudioEventEmitter;
    this.endedSubscription = emitter.addAudioEventListener('ended', onEnded);
    node.onEnded = this.endedSubscription;
    const native = ctx.context as unknown as NativeContext;
    this.route = new AudioNode(
      ctx,
      native.createMediaElementSource(node) as ConstructorParameters<typeof AudioNode>[1],
    );
  }

  /** Null when the file cannot be opened (or FFmpeg is not in this build). */
  static open(ctx: AudioContext, path: string, onEnded: () => void): FileSource | null {
    const native = ctx.context as unknown as NativeContext;
    const node = native.createFileSource({
      source: path,
      loop: false,
      volume: 1,
      playbackRate: 1,
      preservesPitch: false,
    });
    return node ? new FileSource(ctx, node, onEnded) : null;
  }

  get output(): AudioNode {
    return this.route;
  }

  get duration(): number {
    return this.node.duration;
  }

  get currentTime(): number {
    return this.node.currentTime;
  }

  play() {
    this.node.start(this.ctx.currentTime);
  }

  pause() {
    this.node.pause();
  }

  seekTo(seconds: number) {
    this.node.seekToTime(seconds);
  }

  dispose() {
    const emitter = (globalThis as unknown as { AudioEventEmitter: NativeEventEmitter }).AudioEventEmitter;
    this.node.onEnded = '0';
    emitter.removeAudioEventListener('ended', this.endedSubscription);
    try {
      this.node.pause();
    } catch {}
    try {
      this.route.disconnect();
    } catch {}
    this.node.disconnect(undefined);
  }
}
