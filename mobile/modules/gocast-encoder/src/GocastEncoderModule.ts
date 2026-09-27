import { NativeModule, requireNativeModule } from 'expo';

declare class GocastEncoderModule extends NativeModule<{}> {
  /** Configure an AAC-LC encoder. `rate` must be a standard AAC rate (44100, 48000, …). */
  start(rate: number, channels: number, bitrate: number): void;
  /**
   * One array per channel, samples in [-1, 1] → zero or more ADTS frames.
   * The master limiter runs here, before encoding. Pass `null` for `right`
   * on a mono encoder.
   */
  encode(left: Float32Array, right: Float32Array | null): Uint8Array;
  stop(): void;
}

export default requireNativeModule<GocastEncoderModule>('GocastEncoder');
