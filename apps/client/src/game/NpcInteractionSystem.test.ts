import { createGreenhavenNpcs } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { NpcInteractionSystem } from './NpcInteractionSystem';

describe('NpcInteractionSystem', () => {
  it('selects the closest in-range NPC and ignores residents outside their radius', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());

    expect(system.updatePlayerPosition({ x: 0, y: 0 })).toBeNull();
    expect(system.updatePlayerPosition({ x: 36.5, y: 33.5 })).toMatchObject({
      id: 'npc-village-elder',
      name: 'Village Elder',
      type: 'quest_giver',
    });
    expect(system.nearbyNpc?.distance).toBeLessThan(system.nearbyNpc?.interactionRadius ?? 0);
  });

  it('opens the selected NPC dialogue from data and exposes choices without UI knowledge', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());

    expect(system.interact({ x: 39.5, y: 34.5 })).toBe(true);
    expect(system.dialogue).toMatchObject({
      npcId: 'npc-merchant',
      npcName: 'Merchant',
      npcType: 'merchant',
      nodeId: 'merchant-greeting',
      canContinue: false,
      choices: [
        { id: 'ask-cart', label: 'What do you usually carry?' },
        { id: 'ask-road', label: 'Any advice for the road?' },
        { id: 'merchant-leave', label: 'Safe travels.' },
      ],
    });
  });

  it('follows linear dialogue nodes, branches by choice, and closes on a farewell choice', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());
    expect(system.interact({ x: 39.5, y: 34.5 })).toBe(true);

    expect(system.choose('ask-cart')).toBe(true);
    expect(system.dialogue?.nodeId).toBe('merchant-cart');
    expect(system.dialogue?.canContinue).toBe(true);
    expect(system.continueDialogue()).toBe(true);
    expect(system.dialogue?.nodeId).toBe('merchant-farewell');
    expect(system.choose('merchant-goodbye')).toBe(true);
    expect(system.dialogue).toBeNull();
    expect(system.isDialogueOpen).toBe(false);
  });

  it('supports the generic Guard dialogue with both branching and linear nodes', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());

    expect(system.interact({ x: 34.5, y: 34.5 })).toBe(true);
    expect(system.dialogue).toMatchObject({
      npcId: 'npc-guard',
      npcType: 'generic',
      nodeId: 'guard-greeting',
    });
    expect(system.choose('ask-watch')).toBe(true);
    expect(system.dialogue?.nodeId).toBe('guard-watch');
    expect(system.continueDialogue()).toBe(true);
    expect(system.dialogue?.nodeId).toBe('guard-end');
    expect(system.choose('guard-goodbye')).toBe(true);
    expect(system.dialogue).toBeNull();
  });

  it('does not open or advance a conversation when there is no nearby NPC or invalid choice', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());

    expect(system.interact({ x: 0, y: 0 })).toBe(false);
    expect(system.continueDialogue()).toBe(false);
    expect(system.choose('not-a-choice')).toBe(false);
    expect(system.dialogue).toBeNull();
  });

  it('can close a dialogue directly and keeps nearby state available for another interaction', () => {
    const system = new NpcInteractionSystem(createGreenhavenNpcs());
    const position = { x: 36.5, y: 33.5 };

    expect(system.interact(position)).toBe(true);
    expect(system.closeDialogue()).toBe(true);
    expect(system.dialogue).toBeNull();
    expect(system.nearbyNpc?.name).toBe('Village Elder');
  });
});
