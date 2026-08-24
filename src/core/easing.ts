export type EasingId =
  | "linear"
  | "easeInOutQuad"
  | "easeInOutCubic"
  | "easeInOutExpo"
  | "easeOutBack";

export const EASINGS: Record<EasingId, (t: number) => number> = {
  linear: (t) => t,
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export const EASING_OPTIONS: { value: EasingId; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "easeInOutQuad", label: "Ease In/Out Quad" },
  { value: "easeInOutCubic", label: "Ease In/Out Cubic" },
  { value: "easeInOutExpo", label: "Ease In/Out Expo" },
  { value: "easeOutBack", label: "Ease Out Back" },
];

/** Triangle wave: maps linear time to a 0..1..0 bounce over period `period`. */
export function pingPong(time: number, period: number): number {
  if (period <= 0) return 0;
  const t = time % (period * 2);
  return t < period ? t / period : 2 - t / period;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
