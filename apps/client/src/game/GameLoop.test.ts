import type { Logger } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { GameLoop, MAX_FRAME_SECONDS } from './GameLoop';
import type { FrameInfo } from './GameLoop';

/**
 * A hand-driven clock and scheduler: the loop is exercised frame by frame, with no real time and no
 * browser involved. This is the only way to test the stall/resume paths deterministically.
 */
class FakeScheduler {
  private callbacks = new Map<number, (timestampMs: number) => void>();
  private nextHandle = 1;
  now = 0;

  readonly schedule = (callback: (timestampMs: number) => void): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  };

  readonly cancel = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  get pending(): number {
    return this.callbacks.size;
  }

  /** Runs the pending frame after advancing the clock by `advanceMs`. */
  advance(advanceMs: number): void {
    this.now += advanceMs;
    const entries = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of entries) {
      callback(this.now);
    }
  }
}

function makeLoop() {
  const scheduler = new FakeScheduler();
  const frames: FrameInfo[] = [];
  const warnings: string[] = [];
  const loop = new GameLoop({
    onFrame: (info) => frames.push(info),
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    now: () => scheduler.now,
    logger: { warn: (message: string) => warnings.push(message) } as unknown as Logger,
  });
  return { loop, scheduler, frames, warnings };
}

describe('GameLoop', () => {
  it('paints one frame immediately, without moving the world', () => {
    const { loop, frames, scheduler } = makeLoop();
    loop.start();

    // The first frame has no previous timestamp: it reports a zero delta rather than an invented one.
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ deltaSeconds: 0, elapsedSeconds: 0, frame: 1 });
    expect(scheduler.pending).toBe(1);

    loop.stop();
  });

  it('reports the real elapsed time between frames', () => {
    const { loop, frames, scheduler } = makeLoop();
    loop.start();
    scheduler.advance(16.7);
    scheduler.advance(16.7);

    expect(frames).toHaveLength(3);
    expect(frames[1]?.deltaSeconds).toBeCloseTo(0.0167, 4);
    expect(frames[2]?.deltaSeconds).toBeCloseTo(0.0167, 4);

    loop.stop();
  });

  it('clamps a long frame (a backgrounded tab) instead of teleporting the world', () => {
    const { loop, frames, scheduler, warnings } = makeLoop();
    loop.start();
    scheduler.advance(5_000); // the tab was hidden for five seconds

    expect(frames[1]?.deltaSeconds).toBe(MAX_FRAME_SECONDS);
    expect(warnings).toContain('long frame: delta clamped');

    loop.stop();
  });

  it('never reports a negative delta, even if the clock jumps backwards', () => {
    const { loop, frames, scheduler } = makeLoop();
    loop.start();
    scheduler.now = -1_000;
    scheduler.advance(0);

    expect(frames[1]?.deltaSeconds).toBe(0);

    loop.stop();
  });

  it('smooths the reported fps from the measured deltas', () => {
    const { loop, scheduler } = makeLoop();
    loop.start();
    for (let frame = 0; frame < 30; frame += 1) {
      scheduler.advance(20); // 50 fps
    }

    expect(loop.fps).toBeGreaterThan(45);
    expect(loop.fps).toBeLessThan(55);

    loop.stop();
  });

  it('stops for good: no further frames, no pending callbacks', () => {
    const { loop, frames, scheduler } = makeLoop();
    loop.start();
    scheduler.advance(16);
    loop.stop();

    expect(loop.isRunning).toBe(false);
    expect(scheduler.pending).toBe(0);

    scheduler.advance(1_000);
    expect(frames).toHaveLength(2);
  });

  it('is idempotent on start and stop, so a double click cannot start two loops', () => {
    const { loop, scheduler } = makeLoop();
    loop.start();
    loop.start();
    expect(loop.frames).toBe(1);
    expect(scheduler.pending).toBe(1);

    loop.stop();
    loop.stop();
    expect(scheduler.pending).toBe(0);
  });

  it('resets the clock when it resumes, so a long pause is not seen as a long frame', () => {
    const { loop, frames, scheduler, warnings } = makeLoop();
    loop.start();
    scheduler.advance(16);
    loop.stop();

    scheduler.advance(60_000); // a minute passes while paused
    loop.start();

    expect(frames.at(-1)?.deltaSeconds).toBe(0);
    expect(warnings).toEqual([]);

    loop.stop();
  });
});
