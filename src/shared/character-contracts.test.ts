import { describe, expect, it } from "vitest";

import { resolveCharacterAnimations } from "../domain/character-animation.js";
import { CharacterPackManifestSchema } from "./character-contracts.js";
import { CHARACTER_ANIMATION_STATES } from "./character-types.js";

function validManifest(): unknown {
  return {
    animations: { idle: { fps: 6, frames: [0, 1, 2, 3], loop: true } },
    canvas: {
      anchors: { feet: { x: 32, y: 64 } },
      height: 64,
      hitbox: { height: 54, width: 44, x: 10, y: 10 },
      pivot: { x: 32, y: 64 },
      width: 64,
    },
    engineVersion: 1,
    fallbacks: Object.fromEntries(
      CHARACTER_ANIMATION_STATES.map((state) => [state, "idle"]),
    ),
    id: "sample:blue-cat",
    metadata: {
      commercialUse: "unknown",
      creator: "Sample Artist",
      license: "LicenseRef-Proprietary",
      name: "Blue Cat",
      source: "Created for testing",
      thirdPartyAssets: [],
    },
    schemaVersion: 1,
    spritesheet: {
      frameCount: 4,
      frameHeight: 64,
      frameWidth: 64,
      path: "sprites/idle.png",
      scaleMode: "nearest",
    },
    version: "1.0.0",
  };
}

describe("CharacterPackManifestSchema", () => {
  it("accepts one physical idle animation with complete semantic fallbacks", () => {
    const manifest = CharacterPackManifestSchema.parse(validManifest());
    const resolved = resolveCharacterAnimations(manifest);

    expect(resolved.work).toEqual(manifest.animations.idle);
    expect(resolved.ill).toEqual(manifest.animations.idle);
  });

  it("rejects traversal paths and frames outside the spritesheet", () => {
    const manifest = validManifest() as Record<string, any>;
    manifest.spritesheet.path = "../outside.png";
    manifest.animations.idle.frames = [4];

    const result = CharacterPackManifestSchema.safeParse(manifest);

    expect(result.success).toBe(false);
  });

  it("rejects unresolved required semantic states", () => {
    const manifest = validManifest() as Record<string, any>;
    manifest.fallbacks.work = "missing";

    expect(CharacterPackManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
