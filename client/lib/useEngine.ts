import { useSyncExternalStore } from 'react'
import type { AudioEngine } from './audioEngine'

const noopSubscribe = () => () => {}
const noopGet = () => 0

/**
 * Subscribes the calling component to the AudioEngine's change stream.
 * Returns a monotonically-increasing version number; every change in the
 * engine causes a re-render, after which the component can read any
 * getter (`isPlaying`, `getQueue`, etc.) to get fresh values.
 *
 * Replaces the old pattern of `setInterval(() => forceUpdate(n+1), 300)`
 * that re-rendered studio components on a timer regardless of whether
 * anything had changed.
 */
export function useEngineVersion(engine: AudioEngine | null): number {
  return useSyncExternalStore(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getVersion : noopGet,
    noopGet,
  )
}
