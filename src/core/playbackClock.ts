/**
 * Preview transport clock.
 *
 * Authoritative playback time is `elapsed` seconds on the renderer.
 * Bloom, Pulse, Type and Flicker consume `resolveMasterPhase()` derived
 * from that elapsed value (or holdPhase when MASTER HOLD is on).
 *
 * The rAF timestamp is the only time source for advancing elapsed.
 * `performance.now()` is never mixed into the preview delta — a click
 * handler and a rAF callback can disagree after tab throttle, which
 * used to dump paused/hidden real time into the composition.
 *
 * PLAYING + AUTO: elapsed += clamped frame dt
 * PAUSED (Pause All) / tab hidden / scrubbing: elapsed holds
 * MASTER HOLD: elapsed does not advance; holdPhase is the master phase
 */

/** Larger than a dropped frame, smaller than a tab-hide gap. */
export const MAX_PREVIEW_FRAME_SEC = 0.25;

export function clampElapsedSeconds(elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return elapsed;
}

/**
 * Delta between two rAF timestamps in seconds.
 * Any discontinuity (first frame, pause/resume, tab return, clock mix)
 * rebases: dt is 0 so real-world gap never enters playback elapsed.
 */
export function previewClockDelta(prevTs: number | null, ts: number): { dt: number; rebase: boolean } {
  if (!Number.isFinite(ts)) return { dt: 0, rebase: true };
  if (prevTs == null || !Number.isFinite(prevTs)) return { dt: 0, rebase: true };
  const dt = (ts - prevTs) / 1000;
  if (!Number.isFinite(dt) || dt < 0 || dt > MAX_PREVIEW_FRAME_SEC) return { dt: 0, rebase: true };
  return { dt, rebase: false };
}
