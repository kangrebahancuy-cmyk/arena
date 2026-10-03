import type {
  DialogueNode,
  NearbyNpcState,
  NpcData,
  NpcDialogueState,
  Position,
} from '@project-realm/shared';

interface ActiveDialogue {
  readonly npcId: string;
  readonly nodeId: string;
}

/**
 * Proximity-based NPC interaction and data-driven dialogue navigation.
 *
 * This system knows only validated NPC/dialogue data and a player position. UI rendering, keyboard
 * bindings, and PixiJS stay outside so the conversation rules can be tested without a browser.
 */
export class NpcInteractionSystem {
  private readonly npcs: readonly NpcData[];
  private nearby: NearbyNpcState | null = null;
  private active: ActiveDialogue | null = null;

  constructor(npcs: readonly NpcData[]) {
    this.npcs = npcs;
  }

  get nearbyNpc(): NearbyNpcState | null {
    return this.nearby;
  }

  get isDialogueOpen(): boolean {
    return this.active !== null;
  }

  get dialogue(): NpcDialogueState | null {
    if (this.active === null) {
      return null;
    }
    const npc = this.npcs.find((candidate) => candidate.id === this.active?.npcId);
    const node = npc === undefined ? undefined : this.findNode(npc, this.active.nodeId);
    if (npc === undefined || node === undefined) {
      return null;
    }

    return {
      npcId: npc.id,
      npcName: npc.name,
      npcType: npc.type,
      nodeId: node.id,
      text: node.text,
      choices: (node.choices ?? []).map(({ id, label }) => ({ id, label })),
      canContinue: node.nextNodeId !== undefined,
    };
  }

  /** Recomputes the nearest NPC whose interaction radius contains the player's position. */
  updatePlayerPosition(position: Position): NearbyNpcState | null {
    let closest: NearbyNpcState | null = null;
    for (const npc of this.npcs) {
      const distance = Math.hypot(position.x - npc.position.x, position.y - npc.position.y);
      if (distance > npc.interactionRadius) {
        continue;
      }
      if (closest === null || distance < closest.distance) {
        closest = {
          id: npc.id,
          name: npc.name,
          type: npc.type,
          distance,
          interactionRadius: npc.interactionRadius,
        };
      }
    }
    this.nearby = closest;
    return closest;
  }

  /** Opens the nearest NPC's first dialogue node if the player is in range. */
  interact(position: Position): boolean {
    if (this.active !== null) {
      return false;
    }
    const nearby = this.updatePlayerPosition(position);
    if (nearby === null) {
      return false;
    }
    const npc = this.npcs.find((candidate) => candidate.id === nearby.id);
    if (npc === undefined) {
      return false;
    }
    this.active = { npcId: npc.id, nodeId: npc.dialogue.startNodeId };
    return true;
  }

  /** Follows a node's linear `nextNodeId`; choice nodes are handled by `choose`. */
  continueDialogue(): boolean {
    const current = this.currentNode();
    if (current === null || current.node.nextNodeId === undefined) {
      return false;
    }
    this.active = { npcId: current.npc.id, nodeId: current.node.nextNodeId };
    return true;
  }

  /** Selects a data-declared player response, following its target or closing on a null target. */
  choose(choiceId: string): boolean {
    const current = this.currentNode();
    const choice = current?.node.choices?.find((candidate) => candidate.id === choiceId);
    if (current === null || choice === undefined) {
      return false;
    }
    if (choice.nextNodeId === null) {
      this.active = null;
      return true;
    }
    this.active = { npcId: current.npc.id, nodeId: choice.nextNodeId };
    return true;
  }

  closeDialogue(): boolean {
    if (this.active === null) {
      return false;
    }
    this.active = null;
    return true;
  }

  private currentNode(): { readonly npc: NpcData; readonly node: DialogueNode } | null {
    if (this.active === null) {
      return null;
    }
    const npc = this.npcs.find((candidate) => candidate.id === this.active?.npcId);
    const node = npc === undefined ? undefined : this.findNode(npc, this.active.nodeId);
    return npc === undefined || node === undefined ? null : { npc, node };
  }

  private findNode(npc: NpcData, nodeId: string): DialogueNode | undefined {
    return npc.dialogue.nodes.find((node) => node.id === nodeId);
  }
}
