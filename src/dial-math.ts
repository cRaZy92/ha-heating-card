export const ARC_START_DEG = 135;
export const ARC_SWEEP_DEG = 270;
const ARC_END_DEG = ARC_START_DEG + ARC_SWEEP_DEG; // 405

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

export function snap(value: number, step: number, min: number): number {
  return round(min + Math.round((value - min) / step) * step);
}

export function valueToAngle(value: number, min: number, max: number): number {
  const t = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  return ARC_START_DEG + t * ARC_SWEEP_DEG;
}

/** Normalise any angle into [135, 495). Values in [405, 495) are the bottom gap. */
function normalise(angleDeg: number): number {
  let a = ((angleDeg % 360) + 360) % 360;
  if (a < ARC_START_DEG) a += 360;
  return a;
}

/**
 * Angles in the bottom gap clamp to an end: the end nearer `prev` when given
 * (so overshooting past max while dragging stays at max), else the nearer end by angle.
 */
export function angleToValue(angleDeg: number, min: number, max: number, step: number, prev?: number): number {
  const a = normalise(angleDeg);
  if (a > ARC_END_DEG) {
    if (prev !== undefined) return prev >= (min + max) / 2 ? max : min;
    const gapMid = ARC_END_DEG + (360 - ARC_SWEEP_DEG) / 2;
    return a < gapMid ? max : min;
  }
  const value = min + ((a - ARC_START_DEG) / ARC_SWEEP_DEG) * (max - min);
  return clamp(snap(value, step, min), min, max);
}

/** Smallest absolute difference between two angles, in degrees (0..180). */
export function angularDistance(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

export function pointToAngle(x: number, y: number, cx: number, cy: number): number {
  const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  return round((deg + 360) % 360);
}

export function hitsArc(x: number, y: number, cx: number, cy: number, radius: number, tolerance: number): boolean {
  const dist = Math.hypot(x - cx, y - cy);
  if (Math.abs(dist - radius) > tolerance) return false;
  return normalise(pointToAngle(x, y, cx, cy)) <= ARC_END_DEG;
}

const STOPS: [number, [number, number, number]][] = [
  [0, [0x3f, 0x7f, 0xff]],
  [0.5, [0xff, 0x98, 0x00]],
  [1, [0xe5, 0x39, 0x35]],
];

export function tempColor(value: number, min: number, max: number): string {
  const t = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const i = t <= STOPS[1][0] ? 0 : 1;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const f = (t - t0) / (t1 - t0);
  const [r, g, b] = c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
  return `rgb(${r}, ${g}, ${b})`;
}
