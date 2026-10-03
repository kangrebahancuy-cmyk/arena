import type { Logger } from '@project-realm/shared';

/**
 * The render loop.
 *
 * One `requestAnimationFrame` callback, one delta time, one place that decides how much time passed
 * since the previous frame. Everything downstream (simulation steps, camera smoothing, sprite
 * animation) uses that number instead of assuming a frame rate: a 30 Hz phone, a 60 Hz laptop, a
 * 144 Hz monitor and a throttled background tab all advance the world at the same speed.
 *
 * Delta time is clamped before it is used, because a browser reports huge gaps when a tab was hidden
 * or the machine woke from sleep. Unclamped, one frame of "gap" would teleport the player through the
 * map. The clamp is a hard ceiling on a single frame; the fixed-timestep accumulator below handles the
 * rest by dropping time it cannot catch up on (shared `FixedTimestep`).
 *
 * The scheduler and the clock are injected so the whole loop - including the stall and stop cases - is
 * unit-tested in Node, where neither `requestAnimationFrame` nor a real clock is available.
 */

/** Largest frame delta accepted, in seconds. Anything above this is treated as a stall. */
export const MAX_FRAME_SECONDS = 0.25;

export interface FrameInfo {
  /** Seconds since the previous frame, clamped to {@link MAX_FRAME_SECONDS}. */
  readonly deltaSeconds: number;
  /** Real seconds since the loop started (unclamped, for diagnostics). */
  readonly elapsedSeconds: number;
  readonly frame: number;
}

export interface GameLoopOptions {
  /** Called once per animation frame with the frame's timing. */
  readonly onFrame: (info: FrameInfo) => void;
  /** Defaults to `requestAnimationFrame`. Injectable for tests and for pausing loops. */
  readonly schedule?: (callback: (timestampMs: number) => void) => number;
  readonly cancel?: (handle: number) => void;
  /** Defaults to `performance.now()`. */
  readonly now?: () => number;
  readonly logger?: Logger;
}

export class GameLoop {
  private readonly options: GameLoopOptions;
  private readonly schedule: (callback: (timestampMs: number) => void) => number;
  private readonly cancel: (handle: number) => void;
  private readonly now: () => number;
  private handle: number | undefined;
  private lastTimestamp: number | undefined;
  private startedAt = 0;
  private frameCount = 0;
  private smoothedDelta = 0;
  private running = false;

  constructor(options: GameLoopOptions) {
    this.options = options;
    this.schedule = options.schedule ?? ((callback) => globalThis.requestAnimationFrame(callback));
    this.cancel = options.cancel ?? ((handle) => globalThis.cancelAnimationFrame(handle));
    this.now = options.now ?? (() => performance.now());
  }

  get isRunning(): boolean {
    return this.running;
  }

  get frames(): number {
    return this.frameCount;
  }

  /** Smoothed frames per second, from the real deltas. This is a measurement, never a target. */
  get fps(): number {
    return this.smoothedDelta > 0 ? 1 / this.smoothedDelta : 0;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.startedAt = this.now();
    this.lastTimestamp = undefined;
    // Paint the first frame immediately instead of waiting for the next vsync, so a paused loop that
    // resumes does not show a stale picture.
    this.tick(this.now());
    this.scheduleNext();
  }

  /**
   * Stops the loop. The frame in flight is ignored (`running` is checked first), and no further frame
   * is scheduled, so nothing touches the renderer after it has been destroyed.
   */
  stop(): void {
    this.running = false;
    if (this.handle !== undefined) {
      this.cancel(this.handle);
      this.handle = undefined;
    }
    this.lastTimestamp = undefined;
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }
    this.handle = this.schedule((timestampMs) => {
      this.tick(timestampMs);
      this.scheduleNext();
    });
  }

  private tick(timestampMs: number): void {
    if (!this.running) {
      return;
    }

    const previous = this.lastTimestamp;
    this.lastTimestamp = timestampMs;

    // The first frame has no previous timestamp: report a zero delta rather than a made-up one, so
    // starting the loop cannot move the world.
    if (previous === undefined) {
      this.frameCount += 1;
      this.options.onFrame({ deltaSeconds: 0, elapsedSeconds: 0, frame: this.frameCount });
      return;
    }

    const rawDeltaMs = Math.max(0, timestampMs - previous);
    const clampedSeconds = Math.min(rawDeltaMs / 1000, MAX_FRAME_SECONDS);
    if (rawDeltaMs / 1000 > MAX_FRAME_SECONDS) {
      this.options.logger?.warn('long frame: delta clamped', {
        rawMilliseconds: Math.round(rawDeltaMs),
        clampedMilliseconds: MAX_FRAME_SECONDS * 1000,
      });
    }

    this.frameCount += 1;
    // Exponential smoothing for the FPS readout: a single long frame should nudge the number, not
    // make the display jump.
    this.smoothedDelta =
      this.smoothedDelta === 0 ? clampedSeconds : this.smoothedDelta * 0.9 + clampedSeconds * 0.1;

    this.options.onFrame({
      deltaSeconds: clampedSeconds,
      elapsedSeconds: (timestampMs - this.startedAt) / 1000,
      frame: this.frameCount,
    });
  }
}
