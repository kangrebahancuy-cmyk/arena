/**
 * Fixed timestep accumulator.
 *
 * Why fixed steps instead of "move by delta * speed": with a fixed step the simulation is
 * reproducible (same inputs, same result, whatever the frame rate) and every gameplay rule expresses
 * itself in whole steps ("a step is 50 ms"). Rendering stays variable and interpolates. This is also
 * what makes prediction and reconciliation tractable in Phase 10: the client and the server advance
 * the world in the same size bites.
 *
 * The catch-up bound is not decoration. If the tab is backgrounded for ten seconds, a naive
 * accumulator would run 200 steps in one frame, which takes longer than a frame, which produces more
 * missed steps - the "spiral of death" that freezes a browser tab. Beyond the bound we DROP the
 * excess and report it, so callers can log it instead of silently freezing.
 */
export interface FixedStepResult {
  /** How many fixed steps this frame should simulate. */
  readonly steps: number;
  /** Seconds that were dropped because the catch-up bound was hit. 0 in normal operation. */
  readonly droppedSeconds: number;
}

export class FixedTimestep {
  readonly hz: number;
  readonly stepSeconds: number;
  private readonly maxSteps: number;
  private accumulatorSeconds = 0;

  constructor(hz: number, maxCatchUpSteps: number) {
    if (!Number.isFinite(hz) || hz <= 0) {
      throw new RangeError(`FixedTimestep: hz must be > 0, got ${hz}`);
    }
    if (!Number.isInteger(maxCatchUpSteps) || maxCatchUpSteps < 1) {
      throw new RangeError(
        `FixedTimestep: maxCatchUpSteps must be a positive integer, got ${maxCatchUpSteps}`,
      );
    }
    this.hz = hz;
    this.stepSeconds = 1 / hz;
    this.maxSteps = maxCatchUpSteps;
  }

  /**
   * Adds one frame's elapsed time and returns the whole steps to run now.
   *
   * Non-finite or negative deltas are ignored (they happen: a clock jump, a paused tab, a float
   * hiccup) rather than poisoning the accumulator.
   */
  advance(deltaSeconds: number): FixedStepResult {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.accumulatorSeconds += deltaSeconds;
    }

    const available = Math.floor(this.accumulatorSeconds / this.stepSeconds);
    const steps = Math.min(available, this.maxSteps);
    this.accumulatorSeconds -= steps * this.stepSeconds;

    let droppedSeconds = 0;
    if (available > steps) {
      droppedSeconds = (available - steps) * this.stepSeconds;
      this.accumulatorSeconds -= droppedSeconds;
      // Guard against float drift after dropping: never carry a negative accumulator.
      this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds);
    }

    return { steps, droppedSeconds };
  }

  /** Fraction of the next step already elapsed, in [0, 1). Use it to interpolate rendering. */
  get interpolation(): number {
    return this.accumulatorSeconds / this.stepSeconds;
  }

  /** Forgets accumulated time (used when the page becomes visible again). */
  reset(): void {
    this.accumulatorSeconds = 0;
  }
}
