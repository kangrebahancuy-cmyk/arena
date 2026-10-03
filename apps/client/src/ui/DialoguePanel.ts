import type { NpcDialogueState, NpcType } from '@project-realm/shared';
import { el } from './dom';

export interface DialoguePanelActions {
  readonly onContinue: () => void;
  readonly onChoose: (choiceId: string) => void;
  readonly onClose: () => void;
}

const NPC_TYPE_LABELS: Readonly<Record<NpcType, string>> = {
  merchant: 'Merchant',
  quest_giver: 'Village guide',
  generic: 'Resident',
};

/**
 * Accessible dialogue presentation. It receives a view model; all character lines and branches live
 * in validated shared NPC data, never in this UI component.
 */
export class DialoguePanel {
  readonly element: HTMLElement;

  private readonly title: HTMLElement;
  private readonly role: HTMLElement;
  private readonly message: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly actions: DialoguePanelActions;
  private current: NpcDialogueState | null = null;

  constructor(actions: DialoguePanelActions) {
    this.actions = actions;
    this.title = el('h2', { class: 'dialogue__title', id: 'dialogue-title' }, '');
    this.role = el('p', { class: 'dialogue__role' }, '');
    this.message = el('p', { class: 'dialogue__message', 'aria-live': 'polite' }, '');
    this.choices = el('div', { class: 'dialogue__choices' });
    this.continueButton = el(
      'button',
      { type: 'button', class: 'button button--small dialogue__continue' },
      'Continue · E',
    );
    this.continueButton.addEventListener('click', actions.onContinue);
    this.closeButton = el(
      'button',
      { type: 'button', class: 'button button--small dialogue__close' },
      'Close',
    );
    this.closeButton.addEventListener('click', actions.onClose);

    this.element = el(
      'section',
      {
        class: 'dialogue',
        role: 'dialog',
        'aria-modal': 'false',
        'aria-labelledby': 'dialogue-title',
        hidden: '',
      },
      el('header', { class: 'dialogue__header' }, this.role, this.title),
      this.message,
      this.choices,
      el('footer', { class: 'dialogue__actions' }, this.continueButton, this.closeButton),
    );
  }

  update(state: NpcDialogueState | null): void {
    if (state === null) {
      this.current = null;
      this.element.hidden = true;
      return;
    }
    if (sameDialogue(this.current, state)) {
      return;
    }

    this.current = state;
    this.element.hidden = false;
    this.element.dataset['npcType'] = state.npcType;
    this.title.textContent = state.npcName;
    this.role.textContent = NPC_TYPE_LABELS[state.npcType];
    this.message.textContent = state.text;
    this.choices.replaceChildren();
    this.continueButton.hidden = !state.canContinue || state.choices.length > 0;

    for (const choice of state.choices) {
      const button = el(
        'button',
        { type: 'button', class: 'button dialogue__choice' },
        choice.label,
      );
      button.addEventListener('click', () => this.actions.onChoose(choice.id));
      this.choices.append(button);
    }

    const initialFocus =
      this.choices.querySelector<HTMLButtonElement>('button') ??
      (this.continueButton.hidden ? this.closeButton : this.continueButton);
    initialFocus.focus();
  }
}

function sameDialogue(previous: NpcDialogueState | null, next: NpcDialogueState): boolean {
  return (
    previous !== null &&
    previous.npcId === next.npcId &&
    previous.nodeId === next.nodeId &&
    previous.text === next.text &&
    previous.canContinue === next.canContinue &&
    previous.choices.length === next.choices.length &&
    previous.choices.every(
      (choice, index) =>
        choice.id === next.choices[index]?.id && choice.label === next.choices[index]?.label,
    )
  );
}
