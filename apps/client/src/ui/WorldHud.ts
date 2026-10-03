import { el } from './dom';

/**
 * Everything the debug HUD shows, as plain data.
 *
 * The type lives in the UI layer on purpose: the game layer produces a structurally identical object
 * (`WorldStage.hud`), and the HUD never imports game code. Layers stay one-directional, and the HUD
 * stays testable with a hand-written model.
 *
 * Every field is a measurement taken from the running world - frame time, simulated steps, camera,
 * visible counts. Nothing here is a placeholder value or a target the code hopes to hit.
 */
export interface WorldHudModel {
  readonly zone: string;
  readonly backend: string;
  readonly fps: number;
  readonly deltaMs: number;
  readonly simulationHz: number;
  readonly steps: number;
  readonly droppedSeconds: number;
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly player: {
    readonly column: number;
    readonly row: number;
    readonly facing: string;
    readonly moving: boolean;
  };
  readonly visible: {
    readonly tiles: number;
    readonly objects: number;
    readonly actors: number;
    readonly effects: number;
  };
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly resolution: number;
  };
  readonly pixelated: boolean;
  readonly intent: string;
}

/** One row of the HUD: a stable label and a value that is updated in place. */
interface HudRow {
  readonly value: HTMLElement;
  readonly format: (model: WorldHudModel) => string;
}

/**
 * The debug HUD: what the renderer is actually doing, right now.
 *
 * It exists because the acceptance criteria for this phase are about measurable behaviour - the camera
 * following the player, the loop running on delta time, resizing not breaking anything - and a panel
 * that reads real numbers is how a human verifies those in a browser. It is not part of the game's
 * look: it is a development tool, toggleable with F3 / the "HUD" button, and honest about being one.
 */
export class WorldHud {
  readonly element: HTMLElement;
  private readonly rows: HudRow[] = [];
  private visible = true;

  constructor() {
    this.element = el('aside', { class: 'hud', 'aria-label': 'Debug HUD' });
    this.element.append(el('h2', { class: 'hud__title' }, 'Debug HUD'));

    const list = el('dl', { class: 'hud__list' });
    this.addRow(list, 'Zone', (model) => model.zone);
    this.addRow(list, 'Renderer', (model) => model.backend);
    this.addRow(list, 'FPS', (model) => formatNumber(model.fps, 1));
    this.addRow(list, 'Frame delta', (model) => `${formatNumber(model.deltaMs, 2)} ms`);
    this.addRow(list, 'Simulation', (model) => `${model.simulationHz} Hz · ${model.steps} steps`);
    this.addRow(list, 'Dropped time', (model) => `${formatNumber(model.droppedSeconds, 2)} s`);
    this.addRow(
      list,
      'Camera',
      (model) =>
        `${formatNumber(model.camera.x, 0)}, ${formatNumber(model.camera.y, 0)} px · ${formatNumber(model.camera.zoom, 2)}x`,
    );
    this.addRow(
      list,
      'Player',
      (model) =>
        `${model.player.column}, ${model.player.row} · ${model.player.facing}${model.player.moving ? ' (walking)' : ''}`,
    );
    this.addRow(list, 'Input', (model) => model.intent);
    this.addRow(
      list,
      'Visible',
      (model) =>
        `${model.visible.tiles} tiles · ${model.visible.objects} objects · ${model.visible.actors} actors · ${model.visible.effects} effects`,
    );
    this.addRow(
      list,
      'Viewport',
      (model) =>
        `${model.viewport.width}x${model.viewport.height} css @ ${formatNumber(model.viewport.resolution, 2)}x dpr`,
    );
    this.addRow(list, 'Scaling', (model) =>
      model.pixelated ? 'nearest (crisp)' : 'linear (smoothed)',
    );

    this.element.append(list);
    this.element.append(
      el(
        'p',
        { class: 'hud__hint' },
        'WASD / arrows to walk · + and - zoom · 0 reset zoom · P pixel scaling · F3 hide this panel',
      ),
    );
  }

  /** Renders a model. Called at a fixed, low rate by the caller (numbers should be readable). */
  update(model: WorldHudModel): void {
    for (const row of this.rows) {
      row.value.textContent = row.format(model);
    }
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
    return this.visible;
  }

  private addRow(list: HTMLElement, label: string, format: (model: WorldHudModel) => string): void {
    const value = el('dd', { class: 'hud__value' }, '—');
    const row = el('div', { class: 'hud__row' }, el('dt', { class: 'hud__label' }, label), value);
    list.append(row);
    this.rows.push({ value, format });
  }
}

/** Fixed-decimal formatting with a hard guard against NaN/Infinity reaching the screen. */
function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(decimals);
}
