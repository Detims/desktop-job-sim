import { describe, expect, it } from "vitest";

import { createInitialPetState, startPrototypeJob } from "../simulation/pet-simulation.js";
import {
  COMFORT_COOLDOWN_MS,
  SERIOUS_ILLNESS_DURATION_MS,
  applyCareElapsed,
  comfortPet,
  hygieneBand,
  purchaseCareItem,
  stressBand,
  useCareItem,
} from "./care.js";

describe("care and essentials", () => {
  it("uses the confirmed descriptive bands", () => {
    expect(hygieneBand(75)).toBe("Clean");
    expect(hygieneBand(50)).toBe("Tidy");
    expect(hygieneBand(25)).toBe("Messy");
    expect(hygieneBand(24.9)).toBe("Dirty");
    expect(stressBand(25)).toBe("Busy");
    expect(stressBand(50)).toBe("Stressed");
    expect(stressBand(75)).toBe("Overworked");
    expect(stressBand(90)).toBe("Burned Out");
  });

  it("purchases and consumes an essential without losing unrelated household state", () => {
    const initial = createInitialPetState(0);
    const funded = {
      ...initial,
      household: { inventory: { "core:soap": 2 }, wallet: 10 },
      needs: { ...initial.needs, thirst: 60 },
    };
    const purchased = purchaseCareItem(funded, "core:water");
    expect(purchased.household.wallet).toBe(7);
    expect(purchased.household.inventory["core:water"]).toBe(1);
    const used = useCareItem(purchased, "core:water", 100);
    expect(used.needs.thirst).toBe(90);
    expect(used.household.inventory["core:water"]).toBeUndefined();
    expect(used.household.inventory["core:soap"]).toBe(2);
  });

  it("does not charge or consume when a care command is invalid", () => {
    const initial = createInitialPetState(0);
    const funded = {
      ...initial,
      household: { inventory: { "core:medicine": 1 }, wallet: 2 },
    };
    expect(() => purchaseCareItem(funded, "core:water")).toThrow("Not enough");
    expect(() => useCareItem(funded, "core:medicine", 100)).toThrow("only needed");
    expect(funded.household).toEqual({ inventory: { "core:medicine": 1 }, wallet: 2 });
  });

  it("locks Favorite Treat and gives relationship gifts atomically", () => {
    const initial = createInitialPetState(0);
    const funded = {
      ...initial,
      household: { inventory: {}, wallet: 30 },
    };
    expect(() => purchaseCareItem(funded, "core:favorite-treat")).toThrow("Bond 10");

    const purchased = purchaseCareItem(funded, "core:small-gift");
    const given = useCareItem(purchased, "core:small-gift", 1_000);
    expect(given.household.wallet).toBe(22);
    expect(given.household.inventory["core:small-gift"]).toBeUndefined();
    expect(given.relationship.affection).toBe(55);
    expect(given.relationship.bond).toBe(0.5);
  });

  it("keeps Deluxe Meal visible but level-gated until Level 3", () => {
    const funded = {
      ...createInitialPetState(0),
      household: { inventory: {}, wallet: 20 },
      needs: { ...createInitialPetState(0).needs, hunger: 40 },
    };

    expect(() => purchaseCareItem(funded, "core:deluxe-meal")).toThrow(
      "requires Level 3",
    );

    const purchased = purchaseCareItem(
      { ...funded, generalXp: 150 },
      "core:deluxe-meal",
    );
    const used = useCareItem(purchased, "core:deluxe-meal", 100);
    expect(purchased.household.wallet).toBe(8);
    expect(used.needs.hunger).toBe(85);
  });

  it("applies a cooldown to free comfort", () => {
    const initial = createInitialPetState(0);
    const stressed = {
      ...initial,
      care: { ...initial.care, stress: 20 },
      needs: { ...initial.needs, mood: 80 },
    };
    const comforted = comfortPet(stressed, 1_000);
    expect(comforted.care.stress).toBe(15);
    expect(comforted.needs.mood).toBe(85);
    expect(comforted.care.comfortCooldownUntil).toBe(1_000 + COMFORT_COOLDOWN_MS);
    expect(() => comfortPet(comforted, 2_000)).toThrow("cooldown");
  });

  it("starts deterministic illness, interrupts work, and accepts one medicine dose", () => {
    const initial = createInitialPetState(0);
    const working = startPrototypeJob({
      ...initial,
      care: { ...initial.care, health: 19 },
    }, 10);
    const ill = applyCareElapsed(working, working.needs, 0, 20, 1);
    expect(ill.activity).toBeNull();
    expect(ill.presentation).toBe("ill");
    expect(ill.care.seriousIllness?.recoverAt).toBe(20 + SERIOUS_ILLNESS_DURATION_MS);

    const supplied = {
      ...ill,
      household: { ...ill.household, inventory: { "core:medicine": 1 } },
    };
    const treated = useCareItem(supplied, "core:medicine", 1_020);
    expect(treated.care.seriousIllness?.medicineUsed).toBe(true);
    expect(treated.care.seriousIllness?.recoverAt).toBe(
      1_020 + Math.ceil((20 + SERIOUS_ILLNESS_DURATION_MS - 1_020) / 2),
    );
    expect(() => useCareItem({
      ...treated,
      household: { ...treated.household, inventory: { "core:medicine": 1 } },
    }, "core:medicine", 2_000)).toThrow("already been used");
  });
});
