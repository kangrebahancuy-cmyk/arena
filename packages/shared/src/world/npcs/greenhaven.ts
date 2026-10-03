import { NpcDataListSchema } from '../../protocol/npc';
import type { NpcData } from '../../protocol/npc';

/** Original Greenhaven residents and their conversation graphs, kept out of UI and renderer code. */
export const GREENHAVEN_NPCS: readonly NpcData[] = NpcDataListSchema.parse([
  {
    id: 'npc-village-elder',
    name: 'Village Elder',
    position: { x: 35.5, y: 31.5 },
    sprite: 'elder',
    interactionRadius: 2.7,
    type: 'quest_giver',
    dialogue: {
      startNodeId: 'elder-greeting',
      nodes: [
        {
          id: 'elder-greeting',
          text: 'Welcome to Greenhaven. The old bell has kept this village in step through many quiet seasons.',
          choices: [
            { id: 'ask-bell', label: 'What happened to the bell?', nextNodeId: 'elder-bell' },
            { id: 'ask-grove', label: 'Tell me about the grove.', nextNodeId: 'elder-grove' },
            { id: 'elder-leave', label: 'I will look around.', nextNodeId: null },
          ],
        },
        {
          id: 'elder-bell',
          text: 'Its clapper was carried away during a storm. We have not rung it since. One day, someone may help us find where it fell.',
          nextNodeId: 'elder-bell-close',
        },
        {
          id: 'elder-bell-close',
          text: 'For now, the village keeps time by the river and the sun. There is no hurry to mend an old thing.',
          choices: [
            { id: 'bell-again', label: 'Ask something else.', nextNodeId: 'elder-greeting' },
            { id: 'bell-goodbye', label: 'Farewell.', nextNodeId: null },
          ],
        },
        {
          id: 'elder-grove',
          text: 'Heartwood Grove is older than our cottages. The trees there do not speak, but they are excellent listeners.',
          choices: [
            { id: 'grove-again', label: 'Ask something else.', nextNodeId: 'elder-greeting' },
            { id: 'grove-goodbye', label: 'Thank you.', nextNodeId: null },
          ],
        },
      ],
    },
  },
  {
    id: 'npc-merchant',
    name: 'Merchant',
    position: { x: 39.5, y: 34.5 },
    sprite: 'merchant',
    interactionRadius: 2.9,
    type: 'merchant',
    dialogue: {
      startNodeId: 'merchant-greeting',
      nodes: [
        {
          id: 'merchant-greeting',
          text: 'Good day! My cart is full of stories today, not stock. The south road has been kind to me.',
          choices: [
            { id: 'ask-cart', label: 'What do you usually carry?', nextNodeId: 'merchant-cart' },
            { id: 'ask-road', label: 'Any advice for the road?', nextNodeId: 'merchant-road' },
            { id: 'merchant-leave', label: 'Safe travels.', nextNodeId: null },
          ],
        },
        {
          id: 'merchant-cart',
          text: 'Dried apples, blue thread, little brass bells. I trade when the market is open, but today I am only passing through.',
          nextNodeId: 'merchant-farewell',
        },
        {
          id: 'merchant-road',
          text: 'Follow the packed earth through the meadow. If the wind smells of rain, wait beneath a sturdy roof before crossing the shore.',
          nextNodeId: 'merchant-farewell',
        },
        {
          id: 'merchant-farewell',
          text: 'Keep your eyes up and your boots dry. The best discoveries rarely arrive on a schedule.',
          choices: [
            {
              id: 'merchant-again',
              label: 'Ask another question.',
              nextNodeId: 'merchant-greeting',
            },
            { id: 'merchant-goodbye', label: 'Farewell.', nextNodeId: null },
          ],
        },
      ],
    },
  },
  {
    id: 'npc-guard',
    name: 'Guard',
    position: { x: 34.5, y: 34.5 },
    sprite: 'guard',
    interactionRadius: 2.7,
    type: 'generic',
    dialogue: {
      startNodeId: 'guard-greeting',
      nodes: [
        {
          id: 'guard-greeting',
          text: 'All clear in the village square. I am watching the paths, not the people.',
          choices: [
            { id: 'ask-watch', label: 'What are you watching for?', nextNodeId: 'guard-watch' },
            { id: 'ask-quarry', label: 'Is the quarry safe?', nextNodeId: 'guard-quarry' },
            { id: 'guard-leave', label: 'Carry on.', nextNodeId: null },
          ],
        },
        {
          id: 'guard-watch',
          text: 'Loose stones, sudden weather, and carts taking the turn too quickly. Ordinary things deserve a careful eye.',
          nextNodeId: 'guard-end',
        },
        {
          id: 'guard-quarry',
          text: 'Stay outside the old wall unless you know the paths. The stones are sound, but the ground inside is uneven.',
          nextNodeId: 'guard-end',
        },
        {
          id: 'guard-end',
          text: 'If you find a stone out of place, leave it for the quarry crew. They know which ones hold the slope.',
          choices: [
            { id: 'guard-again', label: 'Ask something else.', nextNodeId: 'guard-greeting' },
            { id: 'guard-goodbye', label: 'Understood.', nextNodeId: null },
          ],
        },
      ],
    },
  },
]);

/** Returns fresh, schema-validated NPC/dialogue data for a Greenhaven session. */
export function createGreenhavenNpcs(): readonly NpcData[] {
  return NpcDataListSchema.parse(GREENHAVEN_NPCS);
}
