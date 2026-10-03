import type { AssetProgress } from '../render/Assets';
import type { Direction, NearbyNpcState, NpcDialogueState } from '@project-realm/shared';
import { el } from './dom';
import { DialoguePanel } from './DialoguePanel';
import { WorldHud } from './WorldHud';
import type { WorldHudModel } from './WorldHud';

export interface WorldScreenActions {
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetZoom: () => void;
  readonly onTogglePixelated: () => void;
  readonly onInteract: () => void;
  readonly onAttack: () => void;
  readonly onAdvanceDialogue: () => void;
  readonly onChooseDialogueChoice: (choiceId: string) => void;
  readonly onCloseDialogue: () => void;
}

/**
 * The world screen: the canvas, a loading overlay, the debug HUD and the touch controls.
 *
 * It owns DOM and nothing else. It never imports game code: the game layer pushes data in (`setLoading`,
 * `setReady`, `update`) and the composition root wires its buttons back out through the callbacks.
 * That is what keeps the renderer and the session testable in Node, where no DOM exists.
 */
export class WorldScreen {
  readonly canvas: HTMLCanvasElement;
  readonly hud: WorldHud;
  readonly dialoguePanel: DialoguePanel;
  readonly element: HTMLElement;

  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayDetail: HTMLElement;
  private readonly progressBar: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly dPad: HTMLElement;
  private readonly interactionPanel: HTMLElement;
  private readonly interactionHint: HTMLElement;
  private readonly interactionButton: HTMLButtonElement;
  private nearbyNpc: NearbyNpcState | null = null;
  private hudVisible = true;

  constructor(root: HTMLElement, actions: WorldScreenActions) {
    // The canvas is created as a real element (not by the renderer) so its CSS box drives the size:
    // the world follows the layout, and the renderer follows the canvas.
    this.canvas = el('canvas', { class: 'world__canvas', 'aria-label': 'Greenhaven world' });
    this.hud = new WorldHud();
    this.dialoguePanel = new DialoguePanel({
      onContinue: actions.onAdvanceDialogue,
      onChoose: actions.onChooseDialogueChoice,
      onClose: actions.onCloseDialogue,
    });

    this.overlayTitle = el('h2', { class: 'world__overlay-title' }, 'Preparing the world…');
    this.overlayDetail = el('p', { class: 'world__overlay-detail' }, 'Connecting to the renderer');
    this.progressBar = el('div', { class: 'world__progress-bar' });
    this.overlay = el(
      'div',
      { class: 'world__overlay', role: 'status' },
      el(
        'div',
        { class: 'world__overlay-card' },
        this.overlayTitle,
        this.overlayDetail,
        el('div', { class: 'world__progress' }, this.progressBar),
      ),
    );

    // Honest scope note: programmer art and NPC dialogue work locally; accounts and live server
    // player authority are still future systems.
    this.notice = el(
      'p',
      { class: 'world__notice' },
      'Greenhaven prototype · original generated art · local monsters and dialogue · Space attack · no login',
    );

    this.dPad = this.buildTouchControls(actions);
    this.interactionHint = el('p', { class: 'world__interaction-hint' }, '');
    this.interactionButton = this.button('Talk', actions.onInteract);
    this.interactionPanel = el(
      'aside',
      { class: 'world__interaction', hidden: '' },
      this.interactionHint,
      this.interactionButton,
    );

    this.element = el(
      'main',
      { class: 'world' },
      this.canvas,
      this.overlay,
      this.hud.element,
      this.notice,
      this.dPad,
      this.interactionPanel,
      this.dialoguePanel.element,
    );
    root.replaceChildren(this.element);
  }

  /** Real progress from the asset loader: sheets finished out of sheets defined. */
  setLoading(progress: AssetProgress): void {
    const percent = Math.round(progress.ratio * 100);
    this.overlayDetail.textContent =
      progress.current === ''
        ? `Loading sprites… ${percent}%`
        : `Loading ${progress.current} (${progress.loaded}/${progress.total})`;
    this.progressBar.style.width = `${percent}%`;
  }

  setReady(info: { backend: string; zone: string; simulationHz: number }): void {
    this.overlayTitle.textContent = 'Ready';
    this.overlayDetail.textContent = `${info.zone} · ${info.backend} · simulation at ${info.simulationHz} Hz`;
    this.overlay.classList.add('world__overlay--hidden');
    // The overlay is hidden but must not keep the canvas from being focused for keyboard input.
    this.overlay.setAttribute('aria-hidden', 'true');
    this.canvas.focus();
  }

  /** A start failure is reported on screen with the reason, not left as an empty canvas. */
  setFailed(message: string): void {
    this.overlayTitle.textContent = 'The world could not start';
    this.overlayDetail.textContent = message;
    this.overlay.classList.remove('world__overlay--hidden');
    this.overlay.classList.add('world__overlay--failed');
  }

  update(model: WorldHudModel): void {
    this.hud.update(model);
  }

  updateInteraction(npc: NearbyNpcState | null): void {
    this.nearbyNpc = npc;
    this.renderInteractionPrompt();
  }

  updateDialogue(dialogue: NpcDialogueState | null): void {
    this.dialoguePanel.update(dialogue);
    this.renderInteractionPrompt();
  }

  toggleHud(): boolean {
    this.hudVisible = this.hud.toggle();
    return this.hudVisible;
  }

  destroy(): void {
    this.element.remove();
  }

  private renderInteractionPrompt(): void {
    const canTalk = this.nearbyNpc !== null && this.dialoguePanel.element.hidden;
    this.interactionPanel.hidden = !canTalk;
    this.interactionButton.disabled = !canTalk;
    this.interactionButton.textContent = 'Talk · E';
    this.interactionHint.textContent = canTalk ? `Nearby: ${this.nearbyNpc?.name ?? ''}` : '';
  }

  /**
   * On-screen controls, for touch devices and for anyone who prefers clicking.
   *
   * Buttons carry `data-direction`, which `InputController.bindDirectionButtons` binds: the screen
   * describes the buttons, the input layer decides what pressing them means.
   */
  private buildTouchControls(actions: WorldScreenActions): HTMLElement {
    const button = (direction: Direction, label: string): HTMLElement =>
      el('button', { type: 'button', class: 'dpad__button', 'data-direction': direction }, label);

    return el(
      'div',
      { class: 'world__controls' },
      el(
        'div',
        { class: 'dpad' },
        button('north', 'N'),
        el(
          'div',
          { class: 'dpad__row' },
          button('west', 'W'),
          button('south', 'S'),
          button('east', 'E'),
        ),
      ),
      el(
        'div',
        { class: 'world__buttons' },
        this.button('Attack', actions.onAttack),
        this.button('Zoom in', actions.onZoomIn),
        this.button('Zoom out', actions.onZoomOut),
        this.button('Reset zoom', actions.onResetZoom),
        this.button('Pixel scaling', actions.onTogglePixelated),
      ),
    );
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const element = el('button', { type: 'button', class: 'button button--small' }, label);
    element.addEventListener('click', onClick);
    return element;
  }
}
