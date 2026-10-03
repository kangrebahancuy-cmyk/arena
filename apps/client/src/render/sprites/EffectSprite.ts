import { Sprite } from 'pixi.js';
import { TILE_SIZE, type Position } from '@project-realm/shared';
import { effectFrame } from '../manifests';
import type { TextureLibrary } from '../textures';

/**
 * A short-lived visual effect (currently the footstep dust puff).
 *
 * The frame is derived from the sprite's own age, which the renderer advances with the real frame
 * delta. Effects are purely cosmetic and own no game state, so the lifetime starts when the effect
 * is spawned and the session removes it when it is over - the sprite never outlives its scene entry.
 */
export class EffectSprite extends Sprite {
  private age = 0;
  private readonly effect: string;
  private readonly frames: number;
  private readonly lifetimeSeconds: number;
  private readonly textures: TextureLibrary;
  private currentFrame = -1;

  constructor(
    effect: string,
    position: Position,
    lifetimeSeconds: number,
    textures: TextureLibrary,
    frameCount: number,
  ) {
    super({ texture: textures.frame(effectFrame(effect, 0)), anchor: 0.5, roundPixels: true });
    this.effect = effect;
    this.frames = frameCount;
    this.lifetimeSeconds = lifetimeSeconds;
    this.textures = textures;
    this.label = `effect:${effect}`;
    this.eventMode = 'none';
    // Effects belong to the ground plane: drawn over the tile the character just left.
    this.position.set((position.x + 0.5) * TILE_SIZE, (position.y + 1) * TILE_SIZE);
    this.setFrame(0);
  }

  /** Advances the animation. Returns false once the effect is over and can be removed. */
  advance(deltaSeconds: number): boolean {
    this.age += deltaSeconds;
    if (this.age >= this.lifetimeSeconds) {
      return false;
    }
    const progress = this.age / this.lifetimeSeconds;
    this.setFrame(Math.min(this.frames - 1, Math.floor(progress * this.frames)));
    return true;
  }

  private setFrame(frame: number): void {
    if (frame === this.currentFrame) {
      return;
    }
    this.currentFrame = frame;
    this.texture = this.textures.frame(effectFrame(this.effect, frame));
  }
}
