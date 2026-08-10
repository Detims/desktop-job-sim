import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { pngDimensions } from "../persistence/character-pack-validator.js";
import { BUILT_IN_CHARACTER_MANIFEST } from "./built-in-character.js";

describe("built-in character manifest", () => {
  it("matches the shipped idle spritesheet grid", async () => {
    const image = await readFile(new URL(
      "../../content/core/characters/prototype-cat/idle.png",
      import.meta.url,
    ));
    const dimensions = pngDimensions(image);

    expect(dimensions.width).toBe(
      BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameWidth *
        BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameCount,
    );
    expect(dimensions.height).toBe(
      BUILT_IN_CHARACTER_MANIFEST.spritesheet.frameHeight,
    );
  });
});
