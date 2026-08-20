import {
  AnimatedSprite,
  Application,
  Assets,
  Graphics,
  Rectangle,
  Texture,
} from "pixi.js";

import { characterStateForPresentation } from "../../domain/character-animation.js";
import type {
  CharacterAnimationDefinition,
  CharacterVisual,
} from "../../shared/character-types.js";
import type { Presentation } from "../../shared/pet-types.js";

export function characterFrameRectangles(
  visual: CharacterVisual,
  animation: CharacterAnimationDefinition,
  sheetWidth: number,
): Rectangle[] {
  const columns = Math.floor(sheetWidth / visual.frameWidth);
  if (columns < 1) throw new Error("The character spritesheet has no complete frames.");
  return animation.frames.map((frame) => new Rectangle(
    (frame % columns) * visual.frameWidth,
    Math.floor(frame / columns) * visual.frameHeight,
    visual.frameWidth,
    visual.frameHeight,
  ));
}

interface CharacterVisualOptions {
  builtInAssetUrl: string;
  fallback(): Graphics;
  maxHeight: number;
  maxWidth: number;
  x: number;
  y: number;
}

export class CharacterVisualRenderer {
  private appliedState: ReturnType<typeof characterStateForPresentation> | null = null;
  private assetUrl: string | null = null;
  private current: AnimatedSprite | Graphics | null = null;
  private presentation: Presentation = "idle";
  private reducedMotion = false;
  private sprite: AnimatedSprite | null = null;
  private visual: CharacterVisual | null = null;

  constructor(
    private readonly pixi: Application,
    private readonly options: CharacterVisualOptions,
  ) {}

  get display(): AnimatedSprite | Graphics | null {
    return this.current;
  }

  async replace(visual: CharacterVisual): Promise<void> {
    const assetUrl = visual.assetUrl ?? this.options.builtInAssetUrl;
    let sheet: Texture;
    try {
      sheet = await Assets.load<Texture>(assetUrl);
    } catch (error: unknown) {
      if (this.current === null) this.showFallback();
      throw error;
    }
    const state = characterStateForPresentation(this.presentation);
    const animation = visual.animations[state];
    const textures = characterFrameRectangles(visual, animation, sheet.width).map(
      (frame) => new Texture({ frame, source: sheet.source }),
    );
    const sprite = new AnimatedSprite(textures);
    sprite.anchor.set(
      visual.canvas.pivot.x / visual.canvas.width,
      visual.canvas.pivot.y / visual.canvas.height,
    );
    sprite.loop = animation.loop;
    sprite.animationSpeed = animation.fps / 60;
    sprite.scale.set(Math.min(
      this.options.maxWidth / visual.canvas.width,
      this.options.maxHeight / visual.canvas.height,
    ));
    sprite.position.set(this.options.x, this.options.y);
    if (this.reducedMotion) sprite.gotoAndStop(0);
    else sprite.play();

    const previous = this.current;
    const previousAssetUrl = this.assetUrl;
    this.pixi.stage.addChild(sprite);
    this.current = sprite;
    this.sprite = sprite;
    this.visual = structuredClone(visual);
    this.assetUrl = assetUrl;
    this.appliedState = state;
    if (previous !== null) {
      this.pixi.stage.removeChild(previous);
      if (previous instanceof AnimatedSprite) {
        for (const texture of previous.textures) {
          if (texture instanceof Texture) texture.destroy(false);
        }
      }
      previous.destroy();
    }
    if (previousAssetUrl !== null && previousAssetUrl !== assetUrl) {
      void Assets.unload(previousAssetUrl).catch(() => undefined);
    }
  }

  setPresentation(presentation: Presentation): void {
    this.presentation = presentation;
    if (this.sprite === null || this.visual === null) return;
    const state = characterStateForPresentation(presentation);
    if (state === this.appliedState) return;
    const animation = this.visual.animations[state];
    const sheetWidth = this.sprite.texture.source.width;
    const textures = characterFrameRectangles(this.visual, animation, sheetWidth).map(
      (frame) => new Texture({ frame, source: this.sprite!.texture.source }),
    );
    const previousTextures = [...this.sprite.textures];
    this.sprite.textures = textures;
    this.sprite.loop = animation.loop;
    this.sprite.animationSpeed = animation.fps / 60;
    if (this.reducedMotion) this.sprite.gotoAndStop(0);
    else this.sprite.play();
    this.appliedState = state;
    for (const texture of previousTextures) {
      if (texture instanceof Texture) texture.destroy(false);
    }
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (this.sprite === null) return;
    if (reducedMotion) this.sprite.gotoAndStop(0);
    else this.sprite.play();
  }

  private showFallback(): void {
    const fallback = this.options.fallback();
    fallback.position.set(this.options.x, this.options.y);
    this.pixi.stage.addChild(fallback);
    this.current = fallback;
  }
}
