import { describe, expect, it } from "vitest";

import { builtInCharacterVisual } from "../../domain/built-in-character.js";
import { characterFrameRectangles } from "./character-visual.js";

describe("characterFrameRectangles", () => {
  it("maps animation frames across a fixed PNG grid", () => {
    const visual = {
      ...builtInCharacterVisual(),
      frameCount: 4,
      frameHeight: 32,
      frameWidth: 32,
    };
    const rectangles = characterFrameRectangles(
      visual,
      { fps: 6, frames: [0, 1, 2, 3], loop: true },
      64,
    );

    expect(rectangles.map(({ x, y }) => [x, y])).toEqual([
      [0, 0], [32, 0], [0, 32], [32, 32],
    ]);
  });
});
