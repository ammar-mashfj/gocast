/**
 * How the studio mixes the mic against the music, remembered per browser.
 *
 * These are a broadcaster's habits, not station settings — the same person on
 * a second laptop may well want a different bed — so localStorage is enough.
 * Every access is guarded: private windows and blocked site data throw, and
 * the studio must still go live on the defaults.
 */

/** How far the music drops while the mic is open. */
export type DuckLevel = 'under' | 'low' | 'silence'

/** How quickly the music moves when the mic opens and closes. */
export type FadeSpeed = 'instant' | 'smooth' | 'slow'

export interface MicPrefs {
  duck: DuckLevel
  fade: FadeSpeed
  /** High-pass, presence lift and a gentle compressor on the mic. */
  broadcastVoice: boolean
}

/** Music gain while talking. 0.2 ≈ −14 dB, 0.08 ≈ −22 dB. */
export const DUCK_GAIN: Record<DuckLevel, number> = {
  under: 0.2,
  low: 0.08,
  silence: 0,
}

/**
 * `setTargetAtTime` time constants, in seconds. The move is ~95% done after
 * three of them, so these land at roughly 0.1s, 0.4s and 1.5s.
 */
export const FADE_TIME_CONSTANT: Record<FadeSpeed, number> = {
  instant: 0.03,
  smooth: 0.13,
  slow: 0.5,
}

export const DEFAULT_MIC_PREFS: MicPrefs = {
  duck: 'under',
  fade: 'smooth',
  broadcastVoice: true,
}

const STORE_KEY = 'gocast:studio-mic:v1'

export function loadMicPrefs(): MicPrefs {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return DEFAULT_MIC_PREFS
    const parsed = JSON.parse(raw) as Partial<MicPrefs>
    return {
      duck: parsed.duck && parsed.duck in DUCK_GAIN ? parsed.duck : DEFAULT_MIC_PREFS.duck,
      fade: parsed.fade && parsed.fade in FADE_TIME_CONSTANT ? parsed.fade : DEFAULT_MIC_PREFS.fade,
      broadcastVoice:
        typeof parsed.broadcastVoice === 'boolean' ? parsed.broadcastVoice : DEFAULT_MIC_PREFS.broadcastVoice,
    }
  } catch {
    return DEFAULT_MIC_PREFS
  }
}

export function saveMicPrefs(prefs: MicPrefs): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — the choice lasts for this session only */
  }
}
