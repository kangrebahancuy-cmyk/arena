import { TILE_SIZE } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { Camera, DEFAULT_CAMERA_OPTIONS, defaultZoomForViewport } from './Camera';

/** A camera that snaps instead of smoothing, so assertions are about position, not about easing. */
function instantCamera(overrides = {}): Camera {
  return new Camera({ followHalfLifeSeconds: 0, ...overrides });
}

describe('defaultZoomForViewport', () => {
  it('zooms in on bigger screens and stays inside the zoom limits', () => {
    const phone = defaultZoomForViewport({ width: 360, height: 640 });
    const desktop = defaultZoomForViewport({ width: 1280, height: 720 });
    const huge = defaultZoomForViewport({ width: 8000, height: 4000 });

    expect(desktop).toBeGreaterThanOrEqual(phone);
    expect(huge).toBe(DEFAULT_CAMERA_OPTIONS.maxZoom);
    expect(phone).toBeGreaterThanOrEqual(DEFAULT_CAMERA_OPTIONS.minZoom);
    expect(phone).toBeLessThanOrEqual(DEFAULT_CAMERA_OPTIONS.maxZoom);
  });

  it('never returns a zero or negative zoom for a collapsed viewport', () => {
    expect(defaultZoomForViewport({ width: 0, height: 0 })).toBeGreaterThanOrEqual(1);
  });
});

describe('Camera', () => {
  it('snaps to a position and reports it as its snapshot', () => {
    const camera = instantCamera();
    camera.snapTo({ x: 120, y: 64 });
    expect(camera.snapshot).toMatchObject({ x: 120, y: 64 });
  });

  it('follows the target immediately when smoothing is disabled', () => {
    const camera = instantCamera();
    camera.follow({ x: 500, y: 250 }, 0.016);
    expect(camera.snapshot.x).toBe(500);
    expect(camera.snapshot.y).toBe(250);
  });

  it('covers the same distance in the same time at different frame rates', () => {
    // Two cameras, one stepping at 60 Hz and one at 15 Hz, over the same 0.5 s: exponential smoothing
    // must land them in the same place, which is the whole point of using elapsed time.
    const fast = new Camera({ followHalfLifeSeconds: 0.2 });
    const slow = new Camera({ followHalfLifeSeconds: 0.2 });

    for (let step = 0; step < 30; step += 1) {
      fast.follow({ x: 1000, y: 0 }, 1 / 60);
    }
    for (let step = 0; step < 8; step += 1) {
      slow.follow({ x: 1000, y: 0 }, 1 / 16);
    }

    expect(fast.snapshot.x).toBeCloseTo(slow.snapshot.x, 0);
  });

  it('lags behind the target while the target keeps moving', () => {
    const camera = new Camera({ followHalfLifeSeconds: 0.2 });
    camera.snapTo({ x: 0, y: 0 });
    camera.follow({ x: 100, y: 0 }, 1 / 60);
    expect(camera.snapshot.x).toBeGreaterThan(0);
    expect(camera.snapshot.x).toBeLessThan(100);
  });

  it('clamps the zoom between the configured limits', () => {
    const camera = instantCamera({ minZoom: 2, maxZoom: 4 });
    camera.setZoom(99);
    expect(camera.zoom).toBe(4);
    camera.setZoom(-5);
    expect(camera.zoom).toBe(2);
    camera.zoomBy(1);
    expect(camera.zoom).toBe(3);
  });

  it('keeps the view inside a map that is bigger than the viewport', () => {
    const camera = instantCamera({ zoom: 1 });
    camera.setViewport({ width: 320, height: 240 });
    camera.snapTo({ x: -500, y: -500 });
    camera.clampToMap(64, 40, TILE_SIZE, 1);

    // 64 x 40 tiles at 16 px: the camera cannot be closer than half a viewport (minus the margin) to
    // any edge.
    expect(camera.snapshot.x).toBe(160 - TILE_SIZE);
    expect(camera.snapshot.y).toBe(120 - TILE_SIZE);

    camera.snapTo({ x: 100_000, y: 100_000 });
    camera.clampToMap(64, 40, TILE_SIZE, 1);
    expect(camera.snapshot.x).toBe(64 * TILE_SIZE - 160 + TILE_SIZE);
    expect(camera.snapshot.y).toBe(40 * TILE_SIZE - 120 + TILE_SIZE);
  });

  it('centres a map that is smaller than the viewport on that axis', () => {
    const camera = instantCamera({ zoom: 1 });
    camera.setViewport({ width: 800, height: 600 });
    camera.snapTo({ x: 0, y: 0 });
    camera.clampToMap(4, 3, TILE_SIZE); // 64 x 48 px of map inside an 800 x 600 px view
    expect(camera.snapshot.x).toBe(32);
    expect(camera.snapshot.y).toBe(24);
  });

  it('survives a zero-sized viewport instead of dividing by zero', () => {
    const camera = instantCamera();
    camera.setViewport({ width: 0, height: 0 });
    camera.clampToMap(64, 40, TILE_SIZE);
    expect(Number.isFinite(camera.snapshot.x)).toBe(true);
    expect(Number.isFinite(camera.snapshot.y)).toBe(true);
  });
});
