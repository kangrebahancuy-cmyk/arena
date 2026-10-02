/**
 * Persistence of player characters (accounts own characters).
 *
 * TODO(phase-11/12): implement on PostgreSQL. `save` must be ONE transaction covering the whole
 * aggregate, so a crash can never leave, say, an item both in the inventory and equipped.
 *
 * The persisted aggregate (stats, position, inventory, equipment, quest progress) does not exist yet:
 * it is designed in Phases 7-9. Until then this port is generic over it (`TPersisted`) instead of
 * inventing fields that would later have to be torn out.
 */
export interface CharacterRepository<TPersisted> {
  listForAccount(accountId: string): Promise<readonly CharacterSummary[]>;
  create(accountId: string, name: string): Promise<CreateCharacterResult<TPersisted>>;
  load(characterId: string): Promise<TPersisted | null>;
  /** Persists the authoritative state held by the game server. Never called with client-supplied state. */
  save(characterId: string, state: TPersisted): Promise<void>;
}

/** What the character-select screen needs; deliberately small. */
export interface CharacterSummary {
  readonly id: string;
  readonly name: string;
  readonly level: number;
}

export type CreateCharacterResult<TPersisted> =
  | { readonly ok: true; readonly characterId: string; readonly state: TPersisted }
  | {
      readonly ok: false;
      readonly reason: 'name_taken' | 'invalid_name' | 'character_limit_reached';
    };
