// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { InputController } from './InputController';
import type { MoveIntent } from './InputController';

/** A fake window target: the controller only needs add/removeEventListener. */
function fakeWindow() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  return {
    addEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
      const set = listeners.get(type) ?? new Set();
      set.add(handler as (event: Event) => void);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, handler: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(handler as (event: Event) => void);
    },
    dispatch: (type: string, event: Event) => {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
}

function keyEvent(
  type: 'keydown' | 'keyup',
  key: string,
  target?: EventTarget,
  code = '',
): KeyboardEvent {
  const event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
  if (target !== undefined) {
    Object.defineProperty(event, 'target', { value: target });
  }
  return event;
}

function pointerEvent(type: string, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('InputController', () => {
  it('turns a key press into a movement intent, once', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', 'ArrowUp'));
    // Holding a key repeats keydown; the intent must not be re-emitted for every repeat.
    target.dispatch('keydown', keyEvent('keydown', 'ArrowUp'));
    expect(intents).toEqual([{ moving: true, direction: 'north' }]);

    target.dispatch('keyup', keyEvent('keyup', 'ArrowUp'));
    expect(intents.at(-1)).toEqual({ moving: false, direction: 'north' });

    controller.detach();
  });

  it('supports WASD, arrow keys and physical key codes (AZERTY)', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    for (const [key, direction] of [
      ['d', 'east'],
      ['ArrowLeft', 'west'],
      ['s', 'south'],
      ['w', 'north'],
    ] as const) {
      target.dispatch('keydown', keyEvent('keydown', key));
      expect(intents.at(-1)).toEqual({ moving: true, direction });
      target.dispatch('keyup', keyEvent('keyup', key));
    }

    // Physical code, as reported by a French keyboard where the key labelled Z is QWERTY's W.
    target.dispatch('keydown', keyEvent('keydown', 'z', undefined, 'KeyW'));
    expect(intents.at(-1)).toEqual({ moving: true, direction: 'north' });

    controller.detach();
  });

  it('keeps a direction held when one of multiple controls for that direction is released', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', 'ArrowUp'));
    target.dispatch('keydown', keyEvent('keydown', 'w', undefined, 'KeyW'));
    target.dispatch('keyup', keyEvent('keyup', 'ArrowUp'));

    expect(intents.at(-1)).toEqual({ moving: true, direction: 'north' });
    expect(controller.state.held).toEqual(['north']);

    controller.detach();
    expect(intents.at(-1)).toEqual({ moving: false, direction: 'north' });
  });

  it('walks the most recently pressed direction while keys are held', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', 'ArrowUp'));
    target.dispatch('keydown', keyEvent('keydown', 'ArrowRight'));
    expect(intents.at(-1)).toEqual({ moving: true, direction: 'east' });

    // Releasing the newer key falls back to the one still held, without re-pressing it.
    target.dispatch('keyup', keyEvent('keyup', 'ArrowRight'));
    expect(intents.at(-1)).toEqual({ moving: true, direction: 'north' });

    controller.detach();
  });

  it('ignores keys typed into a form field', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    const input = document.createElement('input');
    target.dispatch('keydown', keyEvent('keydown', 'w', input));
    expect(intents).toEqual([]);

    controller.detach();
  });

  it('releases everything when the window loses focus', () => {
    const target = fakeWindow();
    const intents: MoveIntent[] = [];
    const controller = new InputController({
      onIntent: (intent) => intents.push(intent),
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', 'ArrowDown'));
    target.dispatch('blur', new Event('blur'));
    expect(intents.at(-1)).toEqual({ moving: false, direction: 'south' });

    controller.detach();
  });

  it('reports zoom and scaling keys', () => {
    const target = fakeWindow();
    const zoom = vi.fn();
    const reset = vi.fn();
    const pixelated = vi.fn();
    const controller = new InputController({
      onIntent: () => undefined,
      onZoom: zoom,
      onResetZoom: reset,
      onTogglePixelated: pixelated,
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', '+'));
    target.dispatch('keydown', keyEvent('keydown', '-'));
    target.dispatch('keydown', keyEvent('keydown', '0'));
    target.dispatch('keydown', keyEvent('keydown', 'p'));

    expect(zoom.mock.calls).toEqual([[1], [-1]]);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(pixelated).toHaveBeenCalledTimes(1);

    controller.detach();
  });

  it('routes E to interaction once and Escape to dialogue cancellation', () => {
    const target = fakeWindow();
    const interact = vi.fn();
    const attack = vi.fn();
    const cancel = vi.fn();
    const controller = new InputController({
      onIntent: () => undefined,
      onInteract: interact,
      onAttack: attack,
      onCancel: cancel,
      keyboardTarget: target,
    });
    controller.attach();

    target.dispatch('keydown', keyEvent('keydown', 'e'));
    const repeat = keyEvent('keydown', 'e');
    Object.defineProperty(repeat, 'repeat', { value: true });
    target.dispatch('keydown', repeat);
    target.dispatch('keydown', keyEvent('keydown', ' ', undefined, 'Space'));
    const repeatAttack = keyEvent('keydown', ' ', undefined, 'Space');
    Object.defineProperty(repeatAttack, 'repeat', { value: true });
    target.dispatch('keydown', repeatAttack);
    target.dispatch('keydown', keyEvent('keydown', 'Escape'));

    expect(interact).toHaveBeenCalledTimes(1);
    expect(attack).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    controller.detach();
  });

  it('drives the same intent from the on-screen d-pad', () => {
    const intents: MoveIntent[] = [];
    const controller = new InputController({ onIntent: (intent) => intents.push(intent) });

    const north = document.createElement('button');
    north.dataset['direction'] = 'north';
    const container = document.createElement('div');
    container.append(north);
    controller.bindDirectionButtons(container);

    north.dispatchEvent(pointerEvent('pointerdown'));
    expect(intents.at(-1)).toEqual({ moving: true, direction: 'north' });

    north.dispatchEvent(pointerEvent('pointerup'));
    expect(intents.at(-1)).toEqual({ moving: false, direction: 'north' });

    north.dispatchEvent(pointerEvent('pointerdown'));
    north.dispatchEvent(pointerEvent('pointerleave')); // finger slid off the button
    expect(intents.at(-1)).toEqual({ moving: false, direction: 'north' });
  });

  it('detaches every listener it added', () => {
    const target = fakeWindow();
    const controller = new InputController({ onIntent: () => undefined, keyboardTarget: target });
    controller.attach();
    expect(target.count()).toBeGreaterThan(0);

    controller.detach();
    expect(target.count()).toBe(0);
  });
});
