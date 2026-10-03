import { describe, expect, it } from 'vitest';
import {
  computeCameraTransform,
  isTileInRange,
  screenToWorld,
  visibleTileRange,
  visibleWorldBounds,
  worldToScreen,
} from './camera';
import type { CameraState, CameraViewport } from './camera';
import { TILE_SIZE } from './tileGrid';

const VIEWPORT: CameraViewport = { width: 800, height: 600 };
const CENTRED: CameraState = { x: 0, y: 0, zoom: 1 };

describe('computeCameraTransform', () => {
  it('puts the camera centre in the middle of the viewport', () => {
    expect(computeCameraTransform({ x: 100, y: 50, zoom: 1 }, VIEWPORT)).toEqual({
      x: 300,
      y: 250,
      scale: 1,
    });
  });

  it('scales the world offset by zoom', () => {
    expect(computeCameraTransform({ x: 100, y: 50, zoom: 2 }, VIEWPORT)).toEqual({
      x: 200,
      y: 200,
      scale: 2,
    });
  });
});

describe('worldToScreen / screenToWorld', () => {
  it('maps the camera centre to the viewport centre', () => {
    const camera: CameraState = { x: 42, y: -17, zoom: 3 };

    expect(worldToScreen({ x: 42, y: -17 }, camera, VIEWPORT)).toEqual({ x: 400, y: 300 });
  });

  it('round-trips any point at any zoom', () => {
    const camera: CameraState = { x: 123.5, y: 77.25, zoom: 2.5 };
    const point = { x: 200.75, y: -40.5 };

    const roundTripped = screenToWorld(worldToScreen(point, camera, VIEWPORT), camera, VIEWPORT);

    expect(roundTripped.x).toBeCloseTo(point.x, 10);
    expect(roundTripped.y).toBeCloseTo(point.y, 10);
  });

  it('is consistent with the container transform (what the renderer actually applies)', () => {
    const camera: CameraState = { x: 64, y: 32, zoom: 2 };
    const transform = computeCameraTransform(camera, VIEWPORT);
    const worldPoint = { x: 80, y: 48 };

    const fromTransform = {
      x: worldPoint.x * transform.scale + transform.x,
      y: worldPoint.y * transform.scale + transform.y,
    };

    expect(fromTransform).toEqual(worldToScreen(worldPoint, camera, VIEWPORT));
  });
});

describe('visibleWorldBounds', () => {
  it('covers the viewport around the camera at zoom 1', () => {
    expect(visibleWorldBounds(CENTRED, VIEWPORT)).toEqual({
      minX: -400,
      minY: -300,
      maxX: 400,
      maxY: 300,
    });
  });

  it('shows less world when zoomed in and more when zoomed out', () => {
    const zoomedIn = visibleWorldBounds({ x: 0, y: 0, zoom: 2 }, VIEWPORT);
    const zoomedOut = visibleWorldBounds({ x: 0, y: 0, zoom: 0.5 }, VIEWPORT);

    expect(zoomedIn.maxX).toBe(200);
    expect(zoomedOut.maxX).toBe(800);
  });
});

describe('visibleTileRange', () => {
  const MAP = { columns: 40, rows: 30 };

  it('clamps to the map instead of returning out-of-range tiles', () => {
    const range = visibleTileRange({ x: 0, y: 0, zoom: 1 }, VIEWPORT, MAP.columns, MAP.rows, 0);

    // 800x600 px around the origin at 16 px tiles: columns 0..25, rows 0..19 (the negative half is
    // clamped away because the camera sits on the map's top-left corner).
    expect(range).toEqual({ minColumn: 0, minRow: 0, maxColumn: 25, maxRow: 19 });
  });

  it('includes a margin for objects that overhang their tile', () => {
    const withoutMargin = visibleTileRange(
      { x: 0, y: 0, zoom: 1 },
      VIEWPORT,
      MAP.columns,
      MAP.rows,
      0,
    );
    const withMargin = visibleTileRange(
      { x: 0, y: 0, zoom: 1 },
      VIEWPORT,
      MAP.columns,
      MAP.rows,
      2,
    );

    expect(withMargin.minColumn).toBe(0); // already clamped at the map edge
    expect(withMargin.maxColumn).toBe(withoutMargin.maxColumn + 2);
    expect(withMargin.maxRow).toBe(withoutMargin.maxRow + 2);
  });

  it('follows the camera', () => {
    // A map big enough that the whole viewport fits inside it, so the range is not clamped.
    const columns = 200;
    const rows = 200;
    const camera: CameraState = {
      x: (columns * TILE_SIZE) / 2,
      y: (rows * TILE_SIZE) / 2,
      zoom: 1,
    };
    const range = visibleTileRange(camera, VIEWPORT, columns, rows, 0);

    expect(range.minColumn).toBeGreaterThan(0);
    expect(range.maxColumn).toBeLessThan(columns - 1);
    expect(range.maxColumn - range.minColumn).toBe(50); // 800 / 16
    expect(range.maxRow - range.minRow).toBe(38); // 600 / 16, rounded out
  });

  it('never returns an empty or inverted range, even for a viewport larger than the map', () => {
    const huge: CameraViewport = { width: 100_000, height: 100_000 };
    const range = visibleTileRange({ x: 0, y: 0, zoom: 1 }, huge, 4, 4, 0);

    expect(range).toEqual({ minColumn: 0, minRow: 0, maxColumn: 3, maxRow: 3 });
  });
});

describe('isTileInRange', () => {
  const range = { minColumn: 2, minRow: 3, maxColumn: 5, maxRow: 6 };

  it.each([
    ['inside', { column: 3, row: 4 }, true],
    ['on the min corner', { column: 2, row: 3 }, true],
    ['on the max corner', { column: 5, row: 6 }, true],
    ['left of it', { column: 1, row: 4 }, false],
    ['below it', { column: 3, row: 7 }, false],
  ])('%s', (_label, tile, expected) => {
    expect(isTileInRange(tile, range)).toBe(expected);
  });
});
