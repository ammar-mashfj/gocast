import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class GocastKeepAliveModule extends NativeModule<{}> {
  /** Hold a Wi-Fi lock and a partial wake lock for the length of a broadcast. */
  acquire(): void;
  release(): void;
  /** True once the person has set GoCast to "Unrestricted" battery use. */
  isIgnoringBatteryOptimizations(): boolean;
  /** Open the system dialog that grants it. Returns before the person answers. */
  requestIgnoreBatteryOptimizations(): void;
}

// Android only; null on iOS, where background audio needs none of this.
export default requireOptionalNativeModule<GocastKeepAliveModule>('GocastKeepAlive');
