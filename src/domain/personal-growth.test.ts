import { describe, expect, it } from "vitest";
import { createInitialPetState } from "../simulation/pet-simulation.js";
import {
  crossedPersonalLevels,
  grantGeneralXp,
  hasRequiredLevel,
  nextPersonalLevel,
  personalGrowthEventDrafts,
  personalGrowthMemoryDrafts,
  personalLevel,
} from "./personal-growth.js";

describe("personal growth", () => {
  it("derives the three proof levels from authoritative total XP", () => {
    expect(personalLevel(0)).toBe(1);
    expect(personalLevel(49.99)).toBe(1);
    expect(personalLevel(50)).toBe(2);
    expect(personalLevel(149.99)).toBe(2);
    expect(personalLevel(150)).toBe(3);
    expect(personalLevel(1_000)).toBe(3);
    expect(nextPersonalLevel(50)).toEqual({ level: 3, requiredXp: 150 });
    expect(nextPersonalLevel(150)).toBeNull();
  });

  it("retains XP beyond the proof maximum and never subtracts it", () => {
    const state = createInitialPetState(0);
    expect(grantGeneralXp(state, -5)).toBe(state);
    expect(grantGeneralXp(state, 200).generalXp).toBe(200);
  });

  it("reports every crossed threshold in ascending order", () => {
    expect(crossedPersonalLevels(40, 160)).toEqual([
      { level: 2, requiredXp: 50 },
      { level: 3, requiredXp: 150 },
    ]);
  });

  it("creates ordered events but only the Level 2 Growing Up Memory", () => {
    const prior = { ...createInitialPetState(0), generalXp: 40 };
    const next = { ...prior, generalXp: 160 };

    expect(personalGrowthEventDrafts(prior, next).map((event) => event.details?.level))
      .toEqual([2, 3]);
    expect(personalGrowthMemoryDrafts(prior, next)).toEqual([
      expect.objectContaining({
        category: "personal-growth",
        title: "Growing Up",
      }),
    ]);
    expect(personalGrowthMemoryDrafts(
      { ...prior, generalXp: 100 },
      next,
    )).toEqual([]);
  });

  it("uses the derived level for unlock checks", () => {
    expect(hasRequiredLevel({ ...createInitialPetState(0), generalXp: 49 }, 2))
      .toBe(false);
    expect(hasRequiredLevel({ ...createInitialPetState(0), generalXp: 50 }, 2))
      .toBe(true);
  });
});
