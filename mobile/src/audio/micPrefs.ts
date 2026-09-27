import { readJson, writeJson } from '../lib/kv';

/**
 * How the studio mixes the mic against the music, remembered on this phone.
 * Values and defaults are the web studio's (client/lib/micPrefs.ts), so a
 * broadcaster's mix sounds the same from either.
 */

/** How far the music drops while the mic is open. */
export type DuckLevel = 'under' | 'low' | 'silence';

/** How quickly the music moves when the mic opens and closes. */
export type FadeSpeed = 'instant' | 'smooth' | 'slow';

export interface MicPrefs {
  duck: DuckLevel;
  fade: FadeSpeed;
  /** High-pass, presence lift and a gentle compressor on the mic. */
  broadcastVoice: boolean;
  /**
   * Phone only: input gain in dB ahead of the web's voice chain. A laptop mic
   * in a browser peaks around −10 dB at speaking level; a phone mic opened
   * raw peaks near −40 (measured on a Galaxy A55), and the level varies a lot
   * between models, so it is the broadcaster's to adjust.
   */
  inputGainDb: number;
}

export const INPUT_GAIN_MIN_DB = 0;
export const INPUT_GAIN_MAX_DB = 40;

/** Music gain while talking. 0.2 ≈ −14 dB, 0.08 ≈ −22 dB. */
export const DUCK_GAIN: Record<DuckLevel, number> = {
  under: 0.2,
  low: 0.08,
  silence: 0,
};

/**
 * `setTargetAtTime` time constants, in seconds. The move is ~95% done after
 * three of them, so these land at roughly 0.1s, 0.4s and 1.5s.
 */
export const FADE_TIME_CONSTANT: Record<FadeSpeed, number> = {
  instant: 0.03,
  smooth: 0.13,
  slow: 0.5,
};

export const DEFAULT_MIC_PREFS: MicPrefs = {
  duck: 'under',
  fade: 'smooth',
  broadcastVoice: true,
  inputGainDb: 28,
};

const STORE_KEY = 'studio-mic-v1';

export function loadMicPrefs(): MicPrefs {
  const parsed = readJson<Partial<MicPrefs>>(STORE_KEY, {});
  return {
    duck: parsed.duck && parsed.duck in DUCK_GAIN ? parsed.duck : DEFAULT_MIC_PREFS.duck,
    fade: parsed.fade && parsed.fade in FADE_TIME_CONSTANT ? parsed.fade : DEFAULT_MIC_PREFS.fade,
    broadcastVoice:
      typeof parsed.broadcastVoice === 'boolean' ? parsed.broadcastVoice : DEFAULT_MIC_PREFS.broadcastVoice,
    inputGainDb:
      typeof parsed.inputGainDb === 'number' && Number.isFinite(parsed.inputGainDb)
        ? Math.min(INPUT_GAIN_MAX_DB, Math.max(INPUT_GAIN_MIN_DB, parsed.inputGainDb))
        : DEFAULT_MIC_PREFS.inputGainDb,
  };
}

export function saveMicPrefs(prefs: MicPrefs): void {
  writeJson(STORE_KEY, prefs);
}
