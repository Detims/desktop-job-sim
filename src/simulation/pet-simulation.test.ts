import { describe, expect, it } from "vitest";

import {
  advancePetState,
  cancelActiveJob,
  createInitialPetState,
  PROTOTYPE_JOB,
  startPrototypeJob,
} from "./pet-simulation.js";

function advanceInSteps(stepCount: number, stepMs: number) {
  let now = 1_000;
  let state = startPrototypeJob(createInitialPetState(now), now);

  for (let index = 0; index < stepCount; index += 1) {
    now += stepMs;
    state = advancePetState(state, stepMs, now);
  }

  return state;
}

describe("pet simulation", () => {
  it("produces the same job result for one tick or many ticks", () => {
    const oneTick = advanceInSteps(1, PROTOTYPE_JOB.durationMs);
    const manyTicks = advanceInSteps(15, PROTOTYPE_JOB.durationMs / 15);

    expect(manyTicks.wallet).toBeCloseTo(oneTick.wallet, 8);
    expect(manyTicks.mastery).toBeCloseTo(oneTick.mastery, 8);
    expect(manyTicks.needs.energy).toBeCloseTo(oneTick.needs.energy, 8);
    expect(manyTicks.needs.hunger).toBeCloseTo(oneTick.needs.hunger, 8);
    expect(manyTicks.needs.mood).toBeCloseTo(oneTick.needs.mood, 8);
    expect(manyTicks.needs.thirst).toBeCloseTo(oneTick.needs.thirst, 8);
    expect(manyTicks.activity).toBeNull();
    expect(oneTick.activity).toBeNull();
  });

  it("credits proportional rewards and preserves them after cancellation", () => {
    const startedAt = 1_000;
    const initial = createInitialPetState(startedAt);
    const working = startPrototypeJob(initial, startedAt);
    const halfway = advancePetState(
      working,
      PROTOTYPE_JOB.durationMs / 2,
      startedAt + PROTOTYPE_JOB.durationMs / 2,
    );
    const cancelled = cancelActiveJob(halfway);
    const later = advancePetState(
      cancelled,
      PROTOTYPE_JOB.durationMs,
      startedAt + PROTOTYPE_JOB.durationMs * 2,
    );

    expect(cancelled.wallet).toBeCloseTo(PROTOTYPE_JOB.rewardCoins / 2);
    expect(cancelled.mastery).toBeCloseTo(PROTOTYPE_JOB.rewardMastery / 2);
    expect(later.wallet).toBeCloseTo(cancelled.wallet);
    expect(later.mastery).toBeCloseTo(cancelled.mastery);
    expect(later.activity).toBeNull();
  });

  it("adds the completion-only mastery bonus exactly once", () => {
    const completed = advanceInSteps(1, PROTOTYPE_JOB.durationMs);
    const later = advancePetState(
      completed,
      PROTOTYPE_JOB.durationMs,
      completed.updatedAt + PROTOTYPE_JOB.durationMs,
    );

    expect(completed.wallet).toBeCloseTo(PROTOTYPE_JOB.rewardCoins);
    expect(completed.mastery).toBeCloseTo(
      PROTOTYPE_JOB.rewardMastery +
        PROTOTYPE_JOB.completionMasteryBonus,
    );
    expect(later.mastery).toBeCloseTo(completed.mastery);
  });

  it("never lets needs leave the 0-100 range", () => {
    const initial = createInitialPetState(0);
    const afterLongElapsed = advancePetState(
      initial,
      365 * 24 * 60 * 60 * 1000,
      365 * 24 * 60 * 60 * 1000,
    );

    for (const value of Object.values(afterLongElapsed.needs)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
