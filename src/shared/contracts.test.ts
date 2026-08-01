import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import { PetStateSchema } from "./contracts.js";

describe("pet-state contracts", () => {
  it("normalizes a legacy persisted job and missing knowledge state", () => {
    const legacy = createInitialPetState(0) as unknown as Record<string, unknown>;
    delete legacy.knowledge;
    legacy.activity = {
      accumulatedMs: 5_000,
      creditedCoins: 4,
      creditedMastery: 5 / 3,
      definitionId: "core:prototype-desk-job",
      durationMs: 15_000,
      startedAt: 0,
    };

    const parsed = PetStateSchema.parse(legacy);

    expect(parsed.knowledge).toEqual({ "core:general": 0 });
    expect(parsed.activity).toEqual(expect.objectContaining({ type: "job" }));
  });
});
