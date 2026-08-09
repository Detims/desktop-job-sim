import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import { CommerceTabSchema, PetStateSchema } from "./contracts.js";

describe("pet-state contracts", () => {
  it("accepts only supported Commerce tabs", () => {
    expect(CommerceTabSchema.parse("shop")).toBe("shop");
    expect(CommerceTabSchema.parse("inventory")).toBe("inventory");
    expect(() => CommerceTabSchema.parse("settings")).toThrow();
  });

  it("normalizes a legacy persisted job and missing knowledge and career state", () => {
    const legacy = createInitialPetState(0) as unknown as Record<string, unknown>;
    delete legacy.careers;
    delete legacy.care;
    delete legacy.conditions;
    delete legacy.examCooldowns;
    delete legacy.generalXp;
    delete legacy.knowledge;
    delete legacy.household;
    delete legacy.qualifications;
    delete legacy.relationship;
    legacy.wallet = 27;
    legacy.activity = {
      accumulatedMs: 5_000,
      creditedCoins: 4,
      creditedMastery: 5 / 3,
      definitionId: "core:prototype-desk-job",
      durationMs: 15_000,
      startedAt: 0,
    };

    const parsed = PetStateSchema.parse(legacy);

    expect(parsed.careers).toEqual({});
    expect(parsed.care).toEqual(expect.objectContaining({ health: 100, hygiene: 100, stress: 0 }));
    expect(parsed.conditions).toEqual({});
    expect(parsed.examCooldowns).toEqual({});
    expect(parsed.generalXp).toBe(0);
    expect(parsed.knowledge).toEqual({ "core:general": 0 });
    expect(parsed.household).toEqual({ inventory: {}, wallet: 27 });
    expect(parsed.qualifications).toEqual({});
    expect(parsed.relationship).toEqual(expect.objectContaining({ affection: 50, bond: 0 }));
    expect(parsed.activity).toEqual(expect.objectContaining({
      creditedGeneralXp: 0,
      type: "job",
    }));
  });
});
