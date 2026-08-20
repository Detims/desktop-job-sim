import { describe, expect, it } from "vitest";

import {
  assertValidHomeLayout,
  createInitialHomeLayout,
  HOME_FURNITURE_DEFINITIONS,
  isHomeFurnitureUnlocked,
  validateHomeFurniture,
} from "./home-layout.js";
import { createInitialPetState } from "../simulation/pet-simulation.js";

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

  it("rejects changed footprints and permits storing built-ins", () => {
    const layout = createInitialHomeLayout();
    expect(
      validateHomeFurniture([{ ...layout.furniture[0]!, width: 1 }]),
    ).toEqual({ issue: "footprint", valid: false });
    expect(validateHomeFurniture([layout.furniture[0]!])).toEqual({ valid: true });
    expect(validateHomeFurniture([])).toEqual({ valid: true });
  });

  it("unlocks the exclusive filing cabinet at Clerk rank two", () => {
    const initial = createInitialPetState(0);
    expect(isHomeFurnitureUnlocked(initial, "core:clerk-filing-cabinet")).toBe(false);
    const clerk = {
      ...initial,
      careers: {
        "core:clerk": {
          careerId: "core:clerk",
          enrolledAt: 1,
          mastery: 20,
          promotionReadyAt: null,
          rankId: "core:clerk:clerk",
        },
      },
    };
    expect(isHomeFurnitureUnlocked(clerk, "core:clerk-filing-cabinet")).toBe(true);
    expect(HOME_FURNITURE_DEFINITIONS["core:clerk-filing-cabinet"]?.kind).toBe("filingCabinet");
  });
});
