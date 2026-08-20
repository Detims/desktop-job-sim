import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../../simulation/pet-simulation.js";
import { isClerkWork } from "./clerk-work-visual.js";

describe("isClerkWork", () => {
  it("activates only for Clerk career jobs", () => {
    const state = createInitialPetState(0);
    expect(isClerkWork(state)).toBe(false);
    expect(isClerkWork({
      ...state,
      activity: {
        accumulatedMs: 0,
        careerId: "core:clerk",
        creditedCareerXp: 0,
        creditedCoins: 0,
        creditedGeneralXp: 0,
        definitionId: "core:organize-mail",
        durationMs: 10_000,
        startedAt: 0,
        type: "careerJob",
      },
    })).toBe(true);
  });
});
