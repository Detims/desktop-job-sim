import { describe, expect, it } from "vitest";

import {
  assertValidHomeLayout,
  createInitialHomeLayout,
  validateHomeFurniture,
} from "./home-layout.js";

describe("home layout", () => {
  it("accepts the initial bed and desk layout", () => {
    const layout = createInitialHomeLayout();
    expect(validateHomeFurniture(layout.furniture)).toEqual({ valid: true });
    expect(assertValidHomeLayout(layout)).toBe(layout);
  });

  it("rejects out-of-bounds placement", () => {
    const layout = createInitialHomeLayout();
    const furniture = layout.furniture.map((item) =>
      item.kind === "bed" ? { ...item, x: 11 } : item,
    );
    expect(validateHomeFurniture(furniture)).toEqual({
      issue: "outOfBounds",
      valid: false,
    });
  });

  it("rejects collisions", () => {
    const layout = createInitialHomeLayout();
    const furniture = layout.furniture.map((item) =>
      item.kind === "desk" ? { ...item, x: 2, y: 1 } : item,
    );
    expect(validateHomeFurniture(furniture)).toEqual({
      issue: "collision",
      valid: false,
    });
  });

  it("rejects changed footprints and missing built-ins", () => {
    const layout = createInitialHomeLayout();
    expect(
      validateHomeFurniture([{ ...layout.furniture[0]!, width: 1 }]),
    ).toEqual({ issue: "footprint", valid: false });
    expect(validateHomeFurniture([layout.furniture[0]!])).toEqual({
      issue: "missing",
      valid: false,
    });
  });
});
