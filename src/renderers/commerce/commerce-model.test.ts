import { describe, expect, it } from "vitest";

import { getCareItem } from "../../domain/care-items.js";
import { createInitialPetState } from "../../simulation/pet-simulation.js";
import { purchaseBlockedReason, useBlockedReason } from "./commerce-model.js";

describe("Commerce presentation rules", () => {
  it("shows stable level, bond, and wallet purchase locks", () => {
    const initial = { ...createInitialPetState(0), household: { inventory: {}, wallet: 50 } };
    expect(purchaseBlockedReason(initial, getCareItem("core:deluxe-meal")))
      .toBe("Requires Level 3");
    expect(purchaseBlockedReason(initial, getCareItem("core:favorite-treat")))
      .toBe("Requires Bond 10");
    expect(purchaseBlockedReason(
      { ...initial, household: { inventory: {}, wallet: 0 } },
      getCareItem("core:water"),
    )).toBe("Not enough coins");
  });

  it("disables inventory actions that cannot provide a benefit", () => {
    const initial = createInitialPetState(0);
    const stocked = {
      ...initial,
      household: {
        ...initial.household,
        inventory: { "core:basic-meal": 1, "core:medicine": 1 },
      },
      needs: { ...initial.needs, hunger: 100 },
    };
    expect(useBlockedReason(stocked, getCareItem("core:basic-meal"), 0))
      .toBe("Hunger is already full");
    expect(useBlockedReason(stocked, getCareItem("core:medicine"), 0))
      .toBe("Only usable during Serious Illness");
  });
});
