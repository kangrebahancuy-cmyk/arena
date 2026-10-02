/**
 * Persistence of world-level data that must survive a server restart (as opposed to per-character data).
 *
 * TODO(phase-12): implement on PostgreSQL. Decide there WHAT is persistent: dropped items, NPC or quest
 * flags, world events, ... Monster positions and respawn timers are normally rebuilt from map data and
 * do not need to be stored.
 *
 * The shape of a zone's persistent state is unknown until then, so the port is generic over it.
 */
export interface WorldRepository<TZoneState> {
  loadZoneState(zoneId: string): Promise<TZoneState | null>;
  saveZoneState(zoneId: string, state: TZoneState): Promise<void>;
}
