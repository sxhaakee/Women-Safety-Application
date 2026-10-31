/**
 * Core detection engine — pure TypeScript, no React Native imports.
 * Runs identically in Node (tests) and React Native (runtime).
 */

export interface Sample {
  /** Timestamp in ms */
  t: number;
  /** Accelerometer X in g */
  ax: number;
  /** Accelerometer Y in g */
  ay: number;
  /** Accelerometer Z in g */
  az: number;
  /** Gyroscope X in rad/s (optional) */
  gx?: number;
  /** Gyroscope Y in rad/s */
  gy?: number;
  /** Gyroscope Z in rad/s */
  gz?: number;
}

export type Sensitivity = 'low' | 'medium' | 'high';

export interface DetectorResult {
  kind: 'shake' | 'struggle' | 'snatch' | 'scream';
  confidence: number; // 0..1
  at: number; // ms timestamp
  features: Record<string, number>;
}

/**
 * Fixed-size ring buffer for sensor samples.
 * O(1) push, no per-sample allocation after init.
 */
export class RingBuffer {
  private readonly buf: Sample[];
  private head = 0;
  private _size = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array(capacity).fill(null) as Sample[];
  }

  push(s: Sample): void {
    this.buf[this.head] = s;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  get size(): number {
    return this._size;
  }

  /**
   * Iterate from oldest to newest.
   */
  forEach(fn: (s: Sample, i: number) => void): void {
    if (this._size === 0) return;
    const start = this._size < this.capacity
      ? 0
      : this.head;
    for (let i = 0; i < this._size; i++) {
      const idx = (start + i) % this.capacity;
      fn(this.buf[idx]!, i);
    }
  }

  /**
   * Return slice as array (oldest first, newest last).
   */
  toArray(): Sample[] {
    const result: Sample[] = [];
    this.forEach(s => result.push(s));
    return result;
  }

  /**
   * Latest sample or null.
   */
  get latest(): Sample | null {
    if (this._size === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buf[idx] ?? null;
  }
}

/** Gravity removal: high-pass filter state */
export interface GravityState {
  gx: number;
  gy: number;
  gz: number;
}

export const GRAVITY_ALPHA = 0.8;

/**
 * Apply one-step gravity removal.
 * g_est = α·g_est + (1-α)·a
 * a_hp  = a - g_est
 */
export function removeGravity(
  raw: { x: number; y: number; z: number },
  state: GravityState,
): { hpx: number; hpy: number; hpz: number; state: GravityState } {
  const newGx = GRAVITY_ALPHA * state.gx + (1 - GRAVITY_ALPHA) * raw.x;
  const newGy = GRAVITY_ALPHA * state.gy + (1 - GRAVITY_ALPHA) * raw.y;
  const newGz = GRAVITY_ALPHA * state.gz + (1 - GRAVITY_ALPHA) * raw.z;
  return {
    hpx: raw.x - newGx,
    hpy: raw.y - newGy,
    hpz: raw.z - newGz,
    state: { gx: newGx, gy: newGy, gz: newGz },
  };
}

/** Euclidean magnitude of a 3D vector */
export function magnitude3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** RMS of a numeric array */
export function rms(values: number[]): number {
  if (values.length === 0) return 0;
  const sumSq = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sumSq / values.length);
}

/** Zero-crossing rate of a numeric array */
export function zeroCrossingRate(values: number[]): number {
  if (values.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1]! >= 0) !== (values[i]! >= 0)) crossings++;
  }
  return crossings / (values.length - 1);
}

/** Sigmoid function */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Clamp a number to [min, max] */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
