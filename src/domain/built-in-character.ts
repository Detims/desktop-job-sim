import { resolveCharacterAnimations } from "./character-animation.js";
import type {
  CharacterPackManifest,
  CharacterPackSummary,
  CharacterVisual,
} from "../shared/character-types.js";
import { CHARACTER_ANIMATION_STATES } from "../shared/character-types.js";

export const BUILT_IN_CHARACTER_ID = "core:prototype-cat";

export const BUILT_IN_CHARACTER_MANIFEST: CharacterPackManifest = Object.freeze({
  animations: {
    idle: { fps: 6, frames: [0, 1, 2, 3], loop: true },
  },
  canvas: {
    anchors: { feet: { x: 271.5, y: 724 } },
    height: 724,
    hitbox: { height: 624, width: 343, x: 100, y: 100 },
    pivot: { x: 271.5, y: 724 },
    width: 543,
  },
  engineVersion: 1,
  fallbacks: Object.fromEntries(
    CHARACTER_ANIMATION_STATES.map((state) => [state, "idle"]),
  ) as CharacterPackManifest["fallbacks"],
  id: BUILT_IN_CHARACTER_ID,
  metadata: {
    commercialUse: "allowed",
    creator: "Desktop Pet",
    license: "Project license",
    name: "Prototype Cat",
    source: "Built-in application content",
    thirdPartyAssets: [],
  },
  schemaVersion: 1,
  spritesheet: {
    frameCount: 4,
    frameHeight: 724,
    frameWidth: 543,
    path: "idle.png",
    scaleMode: "nearest",
  },
  version: "1.0.0",
} satisfies CharacterPackManifest);

export const BUILT_IN_CHARACTER_SUMMARY: CharacterPackSummary = Object.freeze({
  builtIn: true,
  creator: BUILT_IN_CHARACTER_MANIFEST.metadata.creator,
  id: BUILT_IN_CHARACTER_ID,
  license: BUILT_IN_CHARACTER_MANIFEST.metadata.license,
  name: BUILT_IN_CHARACTER_MANIFEST.metadata.name,
  version: BUILT_IN_CHARACTER_MANIFEST.version,
});

export function builtInCharacterVisual(): CharacterVisual {
  return {
    animations: resolveCharacterAnimations(BUILT_IN_CHARACTER_MANIFEST),
    assetUrl: null,
    canvas: BUILT_IN_CHARACTER_MANIFEST.canvas,
    frameCount: BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameCount,
    frameHeight: BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameHeight,
    frameWidth: BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameWidth,
    packId: BUILT_IN_CHARACTER_ID,
    scaleMode: BUILT_IN_CHARACTER_MANIFEST.spritesheet.scaleMode,
    version: BUILT_IN_CHARACTER_MANIFEST.version,
  };
}
