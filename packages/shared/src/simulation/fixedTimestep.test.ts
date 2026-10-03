import { describe, expect, it } from 'vitest';
import { FixedTimestep } from './fixedTimestep';

describe('FixedTimestep', () => {
  it('rejects nonsense configuration loudly', () => {
    expect(() => new FixedTimestep(0, 5)).toThrow(RangeError);
    expect(() => new FixedTimestep(-20, 5)).toThrow(RangeError);
    expect(() => new FixedTimestep(Number.NaN, 5)).toThrow(RangeError);
    expect(() => new FixedTimestep(20, 0)).toThrow(RangeError);
    expect(() => new FixedTimestep(20, 1.5)).toThrow(RangeError);
  });

  it('exposes the step length', () => {
    expect(new FixedTimestep(20, 5).stepSeconds).toBeCloseTo(0.05, 12);
    expect(new FixedTimestep(60, 5).stepSeconds).toBeCloseTo(1 / 60, 12);
  });

  it('runs no step before a full step has elapsed', () => {
    const timestep = new FixedTimestep(20, 5);

    expect(timestep.advance(0.016)).toEqual({ steps: 0, droppedSeconds: 0 });
    expect(timestep.advance(0.016)).toEqual({ steps: 0, droppedSeconds: 0 });
    expect(timestep.advance(0.02).steps).toBe(1);
  });

  it('keeps sub-step time so the average rate stays exact', () => {
    const timestep = new FixedTimestep(20, 100);
    let steps = 0;

    // 3 seconds of 60 fps frames (180 frames of 1/60 s) must give exactly 60 steps at 20 Hz.
    for (let frame = 0; frame < 180; frame += 1) {
      steps += timestep.advance(1 / 60).steps;
    }

    expect(steps).toBe(60);
  });

  it('catches up after a stall, up to the bound', () => {
    const timestep = new FixedTimestep(20, 5);

    // 250 ms missed = 5 steps at 20 Hz, exactly the bound.
    expect(timestep.advance(0.25)).toEqual({ steps: 5, droppedSeconds: 0 });
  });

  it('drops the excess instead of spiralling when a tab was backgrounded', () => {
    const timestep = new FixedTimestep(20, 5);

    // 10 seconds hidden = 200 steps; we run 5 and report the 9.75 s we threw away.
    const result = timestep.advance(10);

    expect(result.steps).toBe(5);
    expect(result.droppedSeconds).toBeCloseTo(9.75, 9);
    // The next frame is back to normal: nothing left to catch up.
    expect(timestep.advance(0.05)).toEqual({ steps: 1, droppedSeconds: 0 });
  });

  it('ignores clock jumps: negative, NaN and infinite deltas', () => {
    const timestep = new FixedTimestep(20, 5);

    expect(timestep.advance(-5)).toEqual({ steps: 0, droppedSeconds: 0 });
    expect(timestep.advance(Number.NaN)).toEqual({ steps: 0, droppedSeconds: 0 });
    expect(timestep.advance(Number.POSITIVE_INFINITY)).toEqual({ steps: 0, droppedSeconds: 0 });
    expect(timestep.advance(0.05).steps).toBe(1);
  });

  it('reports interpolation between 0 and 1 and resets on demand', () => {
    const timestep = new FixedTimestep(20, 5);

    timestep.advance(0.025);
    expect(timestep.interpolation).toBeCloseTo(0.5, 9);

    timestep.reset();
    expect(timestep.interpolation).toBe(0);
  });

  it('never runs more than the bound in one frame, whatever the delta', () => {
    const timestep = new FixedTimestep(20, 5);

    for (const delta of [0.5, 1, 5, 1_000]) {
      expect(timestep.advance(delta).steps).toBeLessThanOrEqual(5);
    }
  });
});
