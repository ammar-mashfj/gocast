/**
 * Opening the microphone, shared by the go-live checks (lib/broadcast.ts) and
 * pre-flight's mic check, so the device a host picks and hears on pre-flight
 * is exactly what the show opens.
 */

/** The chosen microphone, per browser: a device belongs to the machine, not a station. */
const MIC_DEVICE_KEY = 'broadcast:micDeviceId'

export function savedMicDeviceId(): string | undefined {
  try { return localStorage.getItem(MIC_DEVICE_KEY) ?? undefined } catch { return undefined }
}

/**
 * Open a microphone: exactly `deviceId` when given, else the default.
 *
 * `exact`, never `ideal`. The browser weighs an ideal device against the
 * other preferences below, and a mono laptop or headset mic loses to a
 * default that can do `channelCount: 2`: picking a mic quietly reopened the
 * default every time.
 */
export function openMic(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      // All three OFF deliberately. They are tuned for speech on a call:
      // autoGainControl rides the level of anything it hears, and
      // noiseSuppression treats sustained tones as noise — between them
      // they audibly chew music. A radio broadcaster's mic sits in the
      // same mixer as the queue, so this must stay clean.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    },
  })
}

/** Remember the chosen microphone for the next show, in this browser. */
export function rememberMicDevice(deviceId: string): void {
  try { localStorage.setItem(MIC_DEVICE_KEY, deviceId) } catch { /* storage blocked */ }
}
