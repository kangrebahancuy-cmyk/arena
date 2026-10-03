import { DIRECTIONS } from '@project-realm/shared';
import type { Direction, MoveIntent } from '@project-realm/shared';

export type { MoveIntent } from '@project-realm/shared';

export interface InputControllerOptions {
  /** Called whenever the movement intent changes (never every frame - only on real changes). */
  readonly onIntent: (intent: MoveIntent) => void;
  /** Zoom by whole steps: +1 zooms in, -1 zooms out. */
  readonly onZoom?: (steps: number) => void;
  /** Back to the zoom that suits the current window size. */
  readonly onResetZoom?: () => void;
  /** Toggle nearest-neighbour scaling (crisp pixels) versus smoothed scaling. */
  readonly onTogglePixelated?: () => void;
  /** Start or advance an in-range NPC interaction. */
  readonly onInteract?: () => void;
  /** Strike the nearest monster in melee range. */
  readonly onAttack?: () => void;
  /** Close the currently open dialogue, if any. */
  readonly onCancel?: () => void;
  /** Reports what is currently held down, for the on-screen readout. */
  readonly onStateChange?: (state: InputState) => void;
  /** Where keyboard events are read from. Defaults to `window`. */
  readonly keyboardTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface InputState {
  readonly held: readonly Direction[];
  readonly active: Direction;
  readonly moving: boolean;
}

interface HeldInput {
  readonly source: string;
  readonly direction: Direction;
}

/**
 * Keyboard and on-screen input. It emits four-direction intent and knows nothing about player state,
 * movement rules, collision or rendering.
 *
 * The most recently pressed control wins. Holding Up then Right walks east; releasing Right returns to
 * north without another key press. Each physical key and pointer is tracked independently, so releasing
 * one of two controls mapped to the same direction cannot accidentally stop the other.
 */
export class InputController {
  private readonly options: InputControllerOptions;
  private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  private readonly held: HeldInput[] = [];
  /** The direction of the last input, kept while nothing is held so the player keeps facing it. */
  private lastDirection: Direction = 'south';
  private readonly keyHandlers: {
    type: 'keydown' | 'keyup' | 'blur';
    handler: (event: Event) => void;
  }[] = [];
  private readonly buttonHandlers: {
    element: HTMLElement;
    type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointerleave';
    handler: (event: Event) => void;
  }[] = [];
  private nextButtonId = 0;
  private attached = false;

  constructor(options: InputControllerOptions) {
    this.options = options;
    this.target = options.keyboardTarget ?? globalThis.window;
  }

  get state(): InputState {
    const active = this.held.at(-1)?.direction ?? this.lastDirection;
    return {
      held: this.held.map(({ direction }) => direction),
      active,
      moving: this.held.length > 0,
    };
  }

  attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;

    const down = (event: Event): void => {
      const keyboard = event as KeyboardEvent;
      if (isTypingTarget(event.target)) {
        return;
      }

      const direction = directionForKey(keyboard);
      if (direction !== undefined) {
        // Arrow keys scroll the page by default, which would fight the game for the viewport.
        event.preventDefault();
        this.pressFromSource(direction, keyboardSource(keyboard));
        return;
      }

      if (keyboard.code === 'Space' || keyboard.key === ' ') {
        event.preventDefault();
        if (!keyboard.repeat) {
          this.options.onAttack?.();
        }
        return;
      }

      if (keyboard.key.toLowerCase() === 'e') {
        event.preventDefault();
        if (!keyboard.repeat) {
          this.options.onInteract?.();
        }
        return;
      }

      if (keyboard.key === 'Escape') {
        if (!keyboard.repeat) {
          this.options.onCancel?.();
        }
        return;
      }

      switch (keyboard.key) {
        case '+':
        case '=':
          this.options.onZoom?.(1);
          break;
        case '-':
        case '_':
          this.options.onZoom?.(-1);
          break;
        case '0':
          this.options.onResetZoom?.();
          break;
        case 'p':
        case 'P':
          this.options.onTogglePixelated?.();
          break;
        default:
          break;
      }
    };

    const up = (event: Event): void => {
      const keyboard = event as KeyboardEvent;
      const direction = directionForKey(keyboard);
      if (direction !== undefined) {
        this.releaseFromSource(direction, keyboardSource(keyboard));
      }
    };

    // A lost focus (alt-tab, devtools) would otherwise leave a key logically held forever.
    const blur = (): void => {
      this.releaseAll();
    };

    for (const [type, handler] of [
      ['keydown', down],
      ['keyup', up],
      ['blur', blur],
    ] as const) {
      this.target.addEventListener(type, handler);
      this.keyHandlers.push({ type, handler });
    }
  }

  /** Wires the on-screen direction buttons (the HUD's d-pad). Buttons carry `data-direction`. */
  bindDirectionButtons(container: HTMLElement): void {
    for (const element of container.querySelectorAll<HTMLElement>('[data-direction]')) {
      const direction = parseDirection(element.dataset['direction']);
      if (direction === undefined) {
        continue;
      }

      const buttonId = this.nextButtonId;
      this.nextButtonId += 1;
      const source = `button:${buttonId}`;
      const press = (event: Event): void => {
        event.preventDefault();
        const pointerId = pointerIdOf(event);
        element.setPointerCapture?.(pointerId);
        this.pressFromSource(direction, `${source}:${pointerId}`);
      };
      const release = (event: Event): void => {
        this.releaseFromSource(direction, `${source}:${pointerIdOf(event)}`);
      };

      for (const [type, handler] of [
        ['pointerdown', press],
        ['pointerup', release],
        ['pointercancel', release],
        ['pointerleave', release],
      ] as const) {
        element.addEventListener(type, handler);
        this.buttonHandlers.push({ element, type, handler });
      }
    }
  }

  detach(): void {
    for (const { type, handler } of this.keyHandlers) {
      this.target.removeEventListener(type, handler);
    }
    this.keyHandlers.length = 0;
    for (const { element, type, handler } of this.buttonHandlers) {
      element.removeEventListener(type, handler);
    }
    this.buttonHandlers.length = 0;
    this.attached = false;
    this.releaseAll();
  }

  /** Simulates a direction press (keyboard, d-pad, or a test). */
  press(direction: Direction): void {
    this.pressFromSource(direction, `manual:${direction}`);
  }

  release(direction: Direction): void {
    this.releaseFromSource(direction, `manual:${direction}`);
  }

  private pressFromSource(direction: Direction, source: string): void {
    if (this.held.some((input) => input.source === source)) {
      return;
    }
    this.held.push({ source, direction });
    this.emit();
  }

  private releaseFromSource(direction: Direction, source: string): void {
    const index = this.held.findIndex(
      (input) => input.source === source && input.direction === direction,
    );
    if (index < 0) {
      return;
    }
    this.held.splice(index, 1);
    this.emit();
  }

  private releaseAll(): void {
    if (this.held.length === 0) {
      return;
    }
    this.held.length = 0;
    this.emit();
  }

  private emit(): void {
    const state = this.state;
    this.lastDirection = state.active;
    this.options.onIntent({ moving: state.moving, direction: state.active });
    this.options.onStateChange?.(state);
  }
}

/** Keyboard labels plus physical codes so controls work on AZERTY and other layouts too. */
const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  arrowup: 'north',
  arrowdown: 'south',
  arrowleft: 'west',
  arrowright: 'east',
  w: 'north',
  s: 'south',
  a: 'west',
  d: 'east',
};

const PHYSICAL_KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  keyw: 'north',
  keys: 'south',
  keya: 'west',
  keyd: 'east',
};

function directionForKey(event: KeyboardEvent): Direction | undefined {
  return (
    KEY_DIRECTIONS[event.key.toLowerCase()] ?? PHYSICAL_KEY_DIRECTIONS[event.code.toLowerCase()]
  );
}

function keyboardSource(event: KeyboardEvent): string {
  return `keyboard:${event.code || event.key.toLowerCase()}`;
}

function parseDirection(value: string | undefined): Direction | undefined {
  return DIRECTIONS.find((direction) => direction === value);
}

function pointerIdOf(event: Event): number {
  const pointerId = (event as PointerEvent).pointerId;
  return Number.isInteger(pointerId) ? pointerId : 0;
}

/** Typing in a form field (player name, chat later) must never move the character. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
