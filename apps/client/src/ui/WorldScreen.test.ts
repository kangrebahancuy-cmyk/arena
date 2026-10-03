// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { WorldScreen } from './WorldScreen';
import type { WorldHudModel } from './WorldHud';

function actions() {
  return {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onTogglePixelated: vi.fn(),
    onInteract: vi.fn(),
    onAttack: vi.fn(),
    onAdvanceDialogue: vi.fn(),
    onChooseDialogueChoice: vi.fn(),
    onCloseDialogue: vi.fn(),
  };
}

function model(overrides: Partial<WorldHudModel> = {}): WorldHudModel {
  return {
    zone: 'Greenhaven',
    area: 'Greenhaven Village',
    backend: 'webgl',
    fps: 60.5,
    deltaMs: 16.6,
    simulationHz: 30,
    steps: 120,
    droppedSeconds: 0,
    camera: { x: 512, y: 328, zoom: 3 },
    player: {
      column: 32,
      row: 20,
      direction: 'east',
      movementState: 'moving',
      speed: 4.2,
      animationState: 'walk',
    },
    visible: { tiles: 420, objects: 12, actors: 3, effects: 2 },
    viewport: { width: 1280, height: 720, resolution: 2 },
    pixelated: true,
    intent: 'held: east',
    nearbyNpc: 'None',
    playerHealth: '100/100 HP',
    monsters: '3/3 active',
    ...overrides,
  };
}

function screen(): { root: HTMLElement; view: WorldScreen } {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, view: new WorldScreen(root, actions()) };
}

describe('WorldScreen', () => {
  it('takes over the root element and leaves a canvas, an overlay and the HUD', () => {
    const { root, view } = screen();
    expect(root.querySelector('canvas')).toBe(view.canvas);
    expect(root.querySelector('.world__overlay')).not.toBeNull();
    expect(root.querySelector('.hud')).not.toBeNull();

    view.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it('says plainly that this is a local prototype with original generated art', () => {
    const { view } = screen();
    const notice = view.element.querySelector('.world__notice');
    expect(notice?.textContent).toMatch(/prototype/i);
    expect(notice?.textContent).toMatch(/original generated art/i);
  });

  it('shows real asset progress while loading', () => {
    const { view } = screen();
    view.setLoading({ loaded: 1, total: 4, ratio: 0.25, current: 'assets/objects.png' });

    const detail = view.element.querySelector('.world__overlay-detail');
    expect(detail?.textContent).toContain('assets/objects.png');
    expect(detail?.textContent).toContain('1/4');
    expect((view.element.querySelector('.world__progress-bar') as HTMLElement).style.width).toBe(
      '25%',
    );
  });

  it('hides the overlay once the world is ready, and reports the real backend', () => {
    const { view } = screen();
    view.setReady({ backend: 'webgl', zone: 'Greenhaven', simulationHz: 30 });

    const overlay = view.element.querySelector('.world__overlay');
    expect(overlay?.classList.contains('world__overlay--hidden')).toBe(true);
    expect(view.element.querySelector('.world__overlay-detail')?.textContent).toContain('webgl');
  });

  it('shows a start failure with its reason instead of an empty canvas', () => {
    const { view } = screen();
    view.setFailed('Could not load asset "assets/actors.png"');

    const overlay = view.element.querySelector('.world__overlay');
    expect(overlay?.classList.contains('world__overlay--hidden')).toBe(false);
    expect(view.element.querySelector('.world__overlay-title')?.textContent).toMatch(
      /could not start/i,
    );
    expect(overlay?.textContent).toContain('assets/actors.png');
  });

  it('renders the HUD from a plain data model, formatting numbers and marking non-finite ones', () => {
    const { view } = screen();
    view.update(model());
    const text = view.element.querySelector('.hud')?.textContent ?? '';

    expect(text).toContain('Greenhaven');
    expect(text).toContain('webgl');
    expect(text).toContain('60.5');
    expect(text).toContain('16.60 ms');
    expect(text).toContain('512, 328 px');
    expect(text).toContain('32, 20 · east · moving · 4.2 tiles/s · walk');
    expect(text).toContain('420 tiles');
    expect(text).toContain('nearest (crisp)');
    expect(text).toContain('100/100 HP');
    expect(text).toContain('3/3 active');

    view.update(model({ fps: Number.NaN, droppedSeconds: Number.POSITIVE_INFINITY }));
    const updated = view.element.querySelector('.hud')?.textContent ?? '';
    expect(updated).toContain('—');
  });

  it('passes the HUD hint about the controls through to the player', () => {
    const { view } = screen();
    const hint = view.element.querySelector('.hud__hint')?.textContent ?? '';
    expect(hint).toContain('WASD');
    expect(hint).toContain('Space attack');
    expect(hint).toContain('zoom');
  });

  it('shows a nearby-NPC prompt, then renders data-driven dialogue choices', () => {
    const root = document.createElement('div');
    const handlers = actions();
    const view = new WorldScreen(root, handlers);
    view.updateInteraction({
      id: 'npc-merchant',
      name: 'Merchant',
      type: 'merchant',
      distance: 1,
      interactionRadius: 2.5,
    });

    const prompt = view.element.querySelector('.world__interaction') as HTMLElement;
    expect(prompt.hidden).toBe(false);
    expect(prompt.textContent).toContain('Merchant');

    view.updateDialogue({
      npcId: 'npc-merchant',
      npcName: 'Merchant',
      npcType: 'merchant',
      nodeId: 'greeting',
      text: 'A fresh road brings fresh stories.',
      choices: [{ id: 'ask-road', label: 'Any advice for the road?' }],
      canContinue: false,
    });

    const panel = view.element.querySelector('.dialogue') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.dialogue__message')?.textContent).toBe(
      'A fresh road brings fresh stories.',
    );
    expect(panel.querySelector('.dialogue__choice')?.textContent).toBe('Any advice for the road?');
    expect(prompt.hidden).toBe(true);
    panel.querySelector<HTMLButtonElement>('.dialogue__choice')?.click();
    expect(handlers.onChooseDialogueChoice).toHaveBeenCalledWith('ask-road');

    view.destroy();
  });

  it('calls back on keyboard-friendly dialogue actions and the mobile talk button', () => {
    const root = document.createElement('div');
    const handlers = actions();
    const view = new WorldScreen(root, handlers);
    view.updateInteraction({
      id: 'npc-elder',
      name: 'Village Elder',
      type: 'quest_giver',
      distance: 1,
      interactionRadius: 2.25,
    });
    view.element.querySelector<HTMLButtonElement>('.world__interaction button')?.click();
    expect(handlers.onInteract).toHaveBeenCalledTimes(1);

    view.updateDialogue({
      npcId: 'npc-elder',
      npcName: 'Village Elder',
      npcType: 'quest_giver',
      nodeId: 'elder-story',
      text: 'Every path begins with a step.',
      choices: [],
      canContinue: true,
    });
    view.element.querySelector<HTMLButtonElement>('.dialogue__continue')?.click();
    expect(handlers.onAdvanceDialogue).toHaveBeenCalledTimes(1);
    view.element.querySelector<HTMLButtonElement>('.dialogue__close')?.click();
    expect(handlers.onCloseDialogue).toHaveBeenCalledTimes(1);

    view.destroy();
  });

  it('toggles the HUD on request', () => {
    const { view } = screen();
    expect(view.toggleHud()).toBe(false);
    expect((view.element.querySelector('.hud') as HTMLElement).hidden).toBe(true);
    expect(view.toggleHud()).toBe(true);
    expect((view.element.querySelector('.hud') as HTMLElement).hidden).toBe(false);
  });

  it('exposes the d-pad buttons the input layer binds, one per direction', () => {
    const { view } = screen();
    const directions = [...view.element.querySelectorAll('[data-direction]')].map(
      (element) => (element as HTMLElement).dataset['direction'],
    );
    expect(directions.sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  it('calls back on the control buttons', () => {
    const root = document.createElement('div');
    const handlers = actions();
    const view = new WorldScreen(root, handlers);

    for (const [label, handler] of [
      ['Zoom in', handlers.onZoomIn],
      ['Zoom out', handlers.onZoomOut],
      ['Reset zoom', handlers.onResetZoom],
      ['Pixel scaling', handlers.onTogglePixelated],
      ['Attack', handlers.onAttack],
    ] as const) {
      const button = [...root.querySelectorAll('button')].find(
        (candidate) => candidate.textContent === label,
      );
      button?.click();
      expect(handler).toHaveBeenCalledTimes(1);
    }

    view.destroy();
  });
});
