import { describe, expect, it } from 'vitest';
import { DialogueSchema, NpcDataListSchema, NpcDataSchema } from './npc';

const dialogue = {
  startNodeId: 'greeting',
  nodes: [
    {
      id: 'greeting',
      text: 'The road is quiet today.',
      choices: [
        { id: 'ask-road', label: 'Which road?', nextNodeId: 'road' },
        { id: 'farewell', label: 'Goodbye.', nextNodeId: null },
      ],
    },
    { id: 'road', text: 'The south road follows the meadow.' },
  ],
} as const;

const npc = {
  id: 'npc-test',
  name: 'Test Resident',
  position: { x: 1.5, y: 2.5 },
  sprite: 'villager',
  interactionRadius: 2.5,
  dialogue,
  type: 'generic',
} as const;

describe('NPC and dialogue schemas', () => {
  it('accepts an NPC with a branching, data-driven dialogue graph', () => {
    expect(NpcDataSchema.parse(npc)).toMatchObject({
      id: 'npc-test',
      name: 'Test Resident',
      type: 'generic',
      dialogue: { startNodeId: 'greeting' },
    });
  });

  it('rejects an unknown dialogue start or an unresolved node reference', () => {
    expect(() => DialogueSchema.parse({ ...dialogue, startNodeId: 'missing' })).toThrow();
    expect(() =>
      DialogueSchema.parse({
        startNodeId: 'greeting',
        nodes: [{ id: 'greeting', text: 'Hello.', nextNodeId: 'missing' }],
      }),
    ).toThrow();
  });

  it('rejects ambiguous nodes and duplicate dialogue IDs', () => {
    expect(() =>
      DialogueSchema.parse({
        startNodeId: 'greeting',
        nodes: [
          { id: 'greeting', text: 'Hello.', nextNodeId: 'end', choices: [] },
          { id: 'greeting', text: 'Duplicate.' },
          { id: 'end', text: 'Goodbye.' },
        ],
      }),
    ).toThrow();
  });

  it('bounds NPC interaction radius and validates the declared role', () => {
    expect(() => NpcDataSchema.parse({ ...npc, interactionRadius: 0 })).toThrow();
    expect(() => NpcDataSchema.parse({ ...npc, interactionRadius: 17 })).toThrow();
    expect(() => NpcDataSchema.parse({ ...npc, type: 'banker' })).toThrow();
  });

  it('requires unique NPC IDs in a roster', () => {
    expect(NpcDataListSchema.parse([npc, { ...npc, id: 'npc-another' }])).toHaveLength(2);
    expect(() => NpcDataListSchema.parse([npc, npc])).toThrow();
  });
});
