import { z } from 'zod';
import { WorldDataIdSchema } from './world';
import { PositionSchema } from '../world/position';

export const NpcTypeSchema = z.enum(['merchant', 'quest_giver', 'generic']);
export type NpcType = z.infer<typeof NpcTypeSchema>;

/** A data-only branch in a conversation graph. `null` closes dialogue from that choice. */
export const DialogueChoiceSchema = z.object({
  id: WorldDataIdSchema,
  label: z.string().min(1).max(100),
  nextNodeId: WorldDataIdSchema.nullable(),
});
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

/** Dialogue nodes refer to one another by ID so content can branch without UI-specific code. */
export const DialogueNodeSchema = z.object({
  id: WorldDataIdSchema,
  text: z.string().min(1).max(800),
  /** Continue to another node when the player presses E or the Continue button. */
  nextNodeId: WorldDataIdSchema.optional(),
  /** Optional player responses; a choice either selects another node or ends the conversation. */
  choices: z.array(DialogueChoiceSchema).max(8).optional(),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

export const DialogueSchema = z
  .object({
    startNodeId: WorldDataIdSchema,
    nodes: z.array(DialogueNodeSchema).min(1).max(64),
  })
  .superRefine((dialogue, context) => {
    const nodeIds = new Set<string>();
    dialogue.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `duplicate dialogue node id "${node.id}"`,
        });
      }
      nodeIds.add(node.id);
    });

    if (!nodeIds.has(dialogue.startNodeId)) {
      context.addIssue({
        code: 'custom',
        path: ['startNodeId'],
        message: `unknown dialogue start node "${dialogue.startNodeId}"`,
      });
    }

    for (const [nodeIndex, node] of dialogue.nodes.entries()) {
      if (node.nextNodeId !== undefined && node.choices !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', nodeIndex],
          message: 'a dialogue node may have a continue target or choices, not both',
        });
      }
      if (node.nextNodeId !== undefined && !nodeIds.has(node.nextNodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', nodeIndex, 'nextNodeId'],
          message: `unknown next dialogue node "${node.nextNodeId}"`,
        });
      }

      const choiceIds = new Set<string>();
      node.choices?.forEach((choice, choiceIndex) => {
        if (choiceIds.has(choice.id)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', nodeIndex, 'choices', choiceIndex, 'id'],
            message: `duplicate dialogue choice id "${choice.id}"`,
          });
        }
        choiceIds.add(choice.id);
      });
    }

    for (const [nodeIndex, node] of dialogue.nodes.entries()) {
      node.choices?.forEach((choice, choiceIndex) => {
        if (choice.nextNodeId !== null && !nodeIds.has(choice.nextNodeId)) {
          context.addIssue({
            code: 'custom',
            path: ['nodes', nodeIndex, 'choices', choiceIndex, 'nextNodeId'],
            message: `unknown next dialogue node "${choice.nextNodeId}"`,
          });
        }
      });
    }
  });
export type Dialogue = z.infer<typeof DialogueSchema>;

/** Data for one world NPC. `sprite` is an actor-sheet appearance key, not art or UI content. */
export const NpcDataSchema = z.object({
  id: WorldDataIdSchema,
  name: z.string().min(1).max(64),
  position: PositionSchema,
  sprite: WorldDataIdSchema,
  interactionRadius: z.number().positive().finite().max(16),
  dialogue: DialogueSchema,
  type: NpcTypeSchema,
});
export type NpcData = z.infer<typeof NpcDataSchema>;

/** Validates a roster and guarantees IDs are unique before it is loaded into a world session. */
export const NpcDataListSchema = z.array(NpcDataSchema).superRefine((npcs, context) => {
  const ids = new Set<string>();
  npcs.forEach((npc, index) => {
    if (ids.has(npc.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `duplicate NPC id "${npc.id}"`,
      });
    }
    ids.add(npc.id);
  });
});

/** Projections consumed by the client HUD and dialogue panel; dialogue text remains in map data. */
export interface NearbyNpcState {
  readonly id: string;
  readonly name: string;
  readonly type: NpcType;
  readonly distance: number;
  readonly interactionRadius: number;
}

export interface NpcDialogueChoiceView {
  readonly id: string;
  readonly label: string;
}

export interface NpcDialogueState {
  readonly npcId: string;
  readonly npcName: string;
  readonly npcType: NpcType;
  readonly nodeId: string;
  readonly text: string;
  readonly choices: readonly NpcDialogueChoiceView[];
  readonly canContinue: boolean;
}
