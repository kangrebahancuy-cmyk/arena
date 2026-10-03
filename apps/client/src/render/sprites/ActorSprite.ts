import { Container, Graphics, Sprite } from 'pixi.js';
import { TILE_SIZE, type Direction, type Position } from '@project-realm/shared';
import { ACTOR_WALK_FRAMES, actorFrame } from '../manifests';
import type { ActorAnimationState } from '../scene';
import type { TextureLibrary } from '../textures';

/** Seconds each walk frame is shown while the actor is moving. */
const WALK_FRAME_SECONDS = 0.14;

/**
 * One animated being in the world: a shadow, a body sprite and a walk cycle.
 *
 * The scene supplies a position (in tile units), a facing and an explicit animation state. Walk-cycle
 * timing and the mirroring of west/east remain rendering concerns and stay here.
 *
 * The sprite is bottom-anchored: the actor's feet sit on the world position, which is what makes
 * characters stand *on* their tile and sort correctly against trees and other actors.
 */
export class ActorSprite extends Container {
  private readonly body: Sprite;
  private frameIndex = 0;
  private frameTimer = 0;
  private facing: Direction = 'south';
  private animationState: ActorAnimationState = 'idle';

  constructor(appearance: string, textures: TextureLibrary) {
    super();
    this.label = `actor:${appearance}`;
    this.eventMode = 'none';

    // Shadow: a soft ellipse under the feet. Draws the character into the world instead of floating.
    const shadow = new Graphics().ellipse(0, 0, 5, 2).fill({ color: 0x16141c, alpha: 0.35 });
    shadow.position.set(0, -1);
    this.addChild(shadow);

    this.body = new Sprite({
      texture: textures.frame(actorFrame(appearance, 'south', 0)),
      anchor: { x: 0.5, y: 1 },
      roundPixels: true,
    });
    this.addChild(this.body);

    this.appearance = appearance;
    this.textures = textures;
  }

  private readonly appearance: string;
  private readonly textures: TextureLibrary;

  /**
   * Applies scene state. Called for every `actor-added` / `actor-changed` command.
   *
   * Position is in TILE units and converted here: keeping the conversion in one place is what lets
   * the same movement math work on any tile size.
   */
  applyState(position: Position, facing: Direction, animationState: ActorAnimationState): void {
    this.position.set((position.x + 0.5) * TILE_SIZE, (position.y + 1) * TILE_SIZE);
    if (facing !== this.facing) {
      this.facing = facing;
      this.refreshTexture();
    }
    if (animationState !== this.animationState) {
      this.animationState = animationState;
      if (animationState !== 'walk') {
        // Every non-walk state uses the neutral frame instead of freezing mid-step.
        this.frameIndex = 0;
        this.frameTimer = 0;
      }
      this.body.tint =
        animationState === 'hurt'
          ? 0xff7272
          : animationState === 'attack'
            ? 0xffd277
            : animationState === 'dead'
              ? 0x8e8e98
              : 0xffffff;
      this.body.alpha = animationState === 'dead' ? 0.55 : 1;
      this.refreshTexture();
    }
  }

  /** Advances the walk cycle. `deltaSeconds` comes from the render loop, never from a fixed guess. */
  advance(deltaSeconds: number): void {
    if (this.animationState !== 'walk' || deltaSeconds <= 0) {
      return;
    }
    this.frameTimer += deltaSeconds;
    while (this.frameTimer >= WALK_FRAME_SECONDS) {
      this.frameTimer -= WALK_FRAME_SECONDS;
      // 0 = neutral, 1 = left step, 2 = right step, then back through neutral: a readable cycle.
      this.frameIndex = (this.frameIndex + 1) % ACTOR_WALK_FRAMES;
    }
    this.refreshTexture();
  }

  private refreshTexture(): void {
    this.body.texture = this.textures.frame(
      actorFrame(this.appearance, this.facing, this.frameIndex),
    );
  }
}
