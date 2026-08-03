import { describe, expect, it } from "vitest";

import {
  advancePetState,
  createInitialPetState,
  PROTOTYPE_JOB,
  PROTOTYPE_REST,
  PROTOTYPE_STUDY,
  startPrototypeJob,
  startPrototypeRest,
  startPrototypeStudy,
} from "../simulation/pet-simulation.js";
import { recoverPetState } from "./recovery.js";

const HOUR_MS = 60 * 60 * 1000;

describe("pet-state recovery", () => {
  it("expires exam cooldown and Discouraged while the application is closed", () => {
    const initial = createInitialPetState(0);
    const persisted = {
      ...initial,
      conditions: {
        "core:discouraged": {
          conditionId: "core:discouraged",
          expiresAt: 600_000,
        },
      },
      examCooldowns: { "core:administrative-assistant-exam": 300_000 },
    };

    const recovered = recoverPetState(persisted, 0, 600_000, true);

    expect(recovered.state.conditions).toEqual({});
    expect(recovered.state.examCooldowns).toEqual({});
  });

  it("uses half of the selected online care intensity offline", () => {
    const initial = createInitialPetState(0);
    const sandbox = recoverPetState(initial, 0, 3_600_000, true, 0);
    const demanding = recoverPetState(initial, 0, 3_600_000, true, 1.5);

    expect(sandbox.state.needs).toEqual(initial.needs);
    expect(demanding.state.needs.hunger).toBeCloseTo(
      initial.needs.hunger - 1.5,
    );
  });

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

  it("recovers only checkpointed study knowledge after a crash", () => {
    const startedAt = 1_000;
    const initial = {
      ...createInitialPetState(startedAt),
      needs: { ...createInitialPetState(startedAt).needs, mood: 50 },
    };
    const studying = startPrototypeStudy(initial, startedAt, {
      restRecovery: 0.05,
      studyGain: 0.05,
    });
    const checkpoint = advancePetState(
      studying,
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
    expect(recovered.state.knowledge["core:general"]).toBeCloseTo(
      (PROTOTYPE_STUDY.rewardKnowledge * 1.05) / 3,
    );
  });

  it("does not continue rest beyond its latest crash checkpoint", () => {
    const startedAt = 1_000;
    const initial = {
      ...createInitialPetState(startedAt),
      needs: { ...createInitialPetState(startedAt).needs, energy: 50 },
    };
    const resting = startPrototypeRest(initial, startedAt, {
      restRecovery: 0.05,
      studyGain: 0.05,
    });
    const checkpoint = advancePetState(
      resting,
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
    expect(recovered.state.needs.energy).toBeLessThan(
      50 + PROTOTYPE_REST.recoveryEnergy * 1.05,
    );
    expect(recovered.state.needs.energy).toBeLessThan(checkpoint.needs.energy);
  });
});
