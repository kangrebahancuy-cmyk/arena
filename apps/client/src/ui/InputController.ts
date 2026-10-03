import type { Direction } from '@project-realm/shared';

/** What the input layer produces: whether the player is moving, and which way. */
export interface MoveIntent {
  readonly moving: boolean;
  readonly direction: Direction;
}

export interface InputControllerOptions {
  /** Called whenever the movement intent changes (never every frame - only on real changes). */
  readonly onIntent: (intent: MoveIntent) => void;
  /** Zoom by whole steps: +1 zooms in, -1 zooms out. */
  readonly onZoom?: (steps: number) => void;
  /** Back to the zoom that suits the current window size. */
  readonly onResetZoom?: () => void;
  /** Toggle nearest-neighbour scaling (crisp pixels) versus smoothed scaling. */
  readonly onTogglePixelated?: () => void;
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

/**
 * Keyboard and on-screen input.
 *
 * A "most recently pressed key wins" model: holding Up and then Right walks east, and releasing Right
 * walks north again without having to re-press Up. That is what players expect from eight-way input,
 * and it costs one array.
 *
 * The controller is pure DOM plus an `onIntent` callback: it knows nothing about the world, the
 * renderer or the session, so it can be driven from a test with a fake event target.
 */
export class InputController {
  private readonly options: InputControllerOptions;
  private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Directions currently held, oldest first. The last entry is the active one. */
  private held: Direction[] = [];
  /** The direction of the last input, kept while nothing is held so the character keeps facing it. */
  private lastDirection: Direction = 'south';
  private readonly keyHandlers: {
    type: 'keydown' | 'keyup' | 'blur';
    handler: (event: Event) => void;
  }[] = [];
  private readonly buttonHandlers: { element: HTMLElement; handler: (event: Event) => void }[] = [];
  private attached = false;

  constructor(options: InputControllerOptions) {
    this.options = options;
    this.target = options.keyboardTarget ?? globalThis.window;
  }

  get state(): InputState {
    const active = this.held.at(-1) ?? this.lastDirection;
    return { held: [...this.held], active, moving: this.held.length > 0 };
  }

  attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;

    const down = (event: Event): void => {
      const key = (event as KeyboardEvent).key;
      if (isTypingTarget(event.target)) {
        return;
      }

      const direction = KEY_DIRECTIONS[key.toLowerCase()] ?? DIRECTION_KEYS[key.toLowerCase()];
      if (direction !== undefined) {
        // Arrow keys scroll the page by default, which would fight the game for the viewport.
        event.preventDefault();
        this.press(direction);
        return;
      }

      switch (key) {
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
      const key = (event as KeyboardEvent).key.toLowerCase();
      const direction = KEY_DIRECTIONS[key] ?? DIRECTION_KEYS[key];
      if (direction !== undefined) {
        this.release(direction);
      }
    };

    // A lost focus (alt-tab, devtools) would otherwise leave a key logically held forever.
    const blur = (): void => {
      this.held = [];
      this.emit();
    };

    // Registered once each and remembered, so `detach` removes exactly what `attach` added: a listener
    // that outlives the world would keep driving a controller nobody owns.
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
      const direction = element.dataset['direction'] as Direction | undefined;
      if (direction === undefined) {
        continue;
      }

      const press = (event: Event): void => {
        event.preventDefault();
        element.setPointerCapture?.((event as PointerEvent).pointerId);
        this.press(direction);
      };
      const release = (): void => {
        this.release(direction);
      };

      element.addEventListener('pointerdown', press);
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('pointerleave', release);
      this.buttonHandlers.push({ element, handler: press }, { element, handler: release });
    }
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    for (const { type, handler } of this.keyHandlers) {
      this.target.removeEventListener(type, handler);
    }
    this.keyHandlers.length = 0;
    for (const { element, handler } of this.buttonHandlers) {
      element.removeEventListener('pointerdown', handler);
      element.removeEventListener('pointerup', handler);
      element.removeEventListener('pointercancel', handler);
      element.removeEventListener('pointerleave', handler);
    }
    this.buttonHandlers.length = 0;
    this.held = [];
  }

  /** Simulates a direction press (keyboard, d-pad, or a test). */
  press(direction: Direction): void {
    if (this.held.includes(direction)) {
      return;
    }
    this.held.push(direction);
    this.emit();
  }

  release(direction: Direction): void {
    const index = this.held.indexOf(direction);
    if (index < 0) {
      return;
    }
    this.held.splice(index, 1);
    this.emit();
  }

  private emit(): void {
    const state = this.state;
    this.lastDirection = state.active;
    this.options.onIntent({ moving: state.moving, direction: state.active });
    this.options.onStateChange?.(state);
  }
}

/** Arrow keys and numpad-style WASD, both mapped to world directions. */
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

/** Physical-key codes, so the controls work on AZERTY and other layouts too. */
const DIRECTION_KEYS: Readonly<Record<string, Direction>> = {
  keyw: 'north',
  keys: 'south',
  keya: 'west',
  keyd: 'east',
};

/** Typing in a form field (player name, chat later) must never move the character. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
