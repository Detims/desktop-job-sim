import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../../simulation/pet-simulation.js";
import { applyPatch, readSnapshot } from "./pet-store.js";

describe("renderer pet store", () => {
  it("applies a patch only when versions match", () => {
    const state = createInitialPetState(1_000);
    const next = applyPatch(state, {
      baseVersion: 0,
      changes: {
        household: { inventory: {}, wallet: 4 },
        statusText: "Patched",
      },
      nextVersion: 1,
    });

    expect(next?.statusText).toBe("Patched");
    expect(next?.household.wallet).toBe(4);
    expect(next?.stateVersion).toBe(1);
  });

  it("signals divergence instead of applying an out-of-order patch", () => {
    const state = createInitialPetState(1_000);
    expect(
      applyPatch(state, {
        baseVersion: 9,
        changes: { household: { inventory: {}, wallet: 99 } },
        nextVersion: 10,
      }),
    ).toBeNull();
  });

  it("rejects malformed snapshots", () => {
    expect(() => readSnapshot({ state: { petId: "incomplete" } })).toThrow();
  });
});
