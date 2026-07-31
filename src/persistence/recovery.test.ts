import { describe, expect, it } from "vitest";

import {
  advancePetState,
  createInitialPetState,
  PROTOTYPE_JOB,
  startPrototypeJob,
} from "../simulation/pet-simulation.js";
import { recoverPetState } from "./recovery.js";

const HOUR_MS = 60 * 60 * 1000;

describe("pet-state recovery", () => {
  it("applies at most eight hours of offline decay at half rate", () => {
    const initial = createInitialPetState(1_000);
    const recovered = recoverPetState(
      initial,
      1_000,
      1_000 + 24 * HOUR_MS,
      true,
    );

    expect(recovered.offlineElapsedMs).toBe(8 * HOUR_MS);
    expect(recovered.state.needs).toEqual({
      energy: 82,
      hunger: 74,
      mood: 86,
      thirst: 68,
    });
    expect(recovered.diagnostics.map(({ code }) => code)).toContain(
      "recovery.offline_capped",
    );
  });

  it("applies zero offline decay when the wall clock moves backward", () => {
    const initial = createInitialPetState(10_000);
    const recovered = recoverPetState(initial, 10_000, 5_000, true);

    expect(recovered.offlineElapsedMs).toBe(0);
    expect(recovered.state.needs).toEqual(initial.needs);
    expect(recovered.diagnostics.map(({ code }) => code)).toContain(
      "recovery.invalid_clock",
    );
  });

  it("cancels a crashed job at its checkpoint without adding rewards", () => {
    const startedAt = 1_000;
    const working = startPrototypeJob(
      createInitialPetState(startedAt),
      startedAt,
    );
    const checkpoint = advancePetState(
      working,
      5_000,
      startedAt + 5_000,
    );
    const recovered = recoverPetState(
      checkpoint,
      startedAt + 5_000,
      startedAt + 7_000,
      false,
    );

    expect(recovered.state.activity).toBeNull();
    expect(recovered.state.wallet).toBeCloseTo(
      PROTOTYPE_JOB.rewardCoins / 3,
    );
    expect(recovered.state.mastery).toBeCloseTo(
      PROTOTYPE_JOB.rewardMastery / 3,
    );
    expect(recovered.diagnostics.map(({ code }) => code)).toContain(
      "recovery.crash_settled",
    );
  });
});
