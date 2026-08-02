import { describe, expect, it } from "vitest";

import {
  advancePetState,
  cancelActiveActivity,
  createInitialPetState,
  PROTOTYPE_REST,
  PROTOTYPE_STUDY,
  PROTOTYPE_JOB,
  startPrototypeJob,
  startPrototypeRest,
  startPrototypeStudy,
  startCareerJob,
} from "./pet-simulation.js";
import { CLERK_CAREER, CLERK_JOBS, enrollCareer } from "../domain/career.js";

const NO_BONUSES = { restRecovery: 0, studyGain: 0 };
const FURNITURE_BONUSES = { restRecovery: 0.05, studyGain: 0.05 };

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
  it("awards proportional Clerk coins and XP without general mastery", () => {
    const initial = createInitialPetState(0);
    const enrolled = enrollCareer(
      { ...initial, knowledge: { "core:general": 10 } },
      CLERK_CAREER.id,
      0,
    );
    const working = startCareerJob(enrolled, 0, CLERK_JOBS[0]!.id);
    const halfway = advancePetState(working, 7_500, 7_500);

    expect(halfway.wallet).toBeCloseTo(5);
    expect(halfway.careers[CLERK_CAREER.id]?.mastery).toBeCloseTo(5);
    expect(halfway.mastery).toBe(0);
    expect(cancelActiveActivity(halfway).careers[CLERK_CAREER.id]?.mastery)
      .toBeCloseTo(5);
  });

  it("rejects career work until its career and rank are unlocked", () => {
    expect(() =>
      startCareerJob(createInitialPetState(0), 0, CLERK_JOBS[0]!.id),
    ).toThrow("still locked");
    const enrolled = enrollCareer(
      {
        ...createInitialPetState(0),
        knowledge: { "core:general": 5 },
      },
      CLERK_CAREER.id,
      0,
    );
    expect(() => startCareerJob(enrolled, 0, CLERK_JOBS[1]!.id))
      .toThrow("still locked");
  });

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
    const cancelled = cancelActiveActivity(halfway);
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

  it("scales only passive need decay with care intensity", () => {
    const initial = createInitialPetState(0);
    const sandbox = advancePetState(initial, 3_600_000, 3_600_000, 0);
    const demanding = advancePetState(initial, 3_600_000, 3_600_000, 1.5);

    expect(sandbox.needs).toEqual(initial.needs);
    expect(demanding.needs.hunger).toBeCloseTo(initial.needs.hunger - 3);

    const sandboxWork = advancePetState(
      startPrototypeJob(initial, 0),
      PROTOTYPE_JOB.durationMs,
      PROTOTYPE_JOB.durationMs,
      0,
    );
    expect(sandboxWork.needs.energy).toBeCloseTo(
      initial.needs.energy - PROTOTYPE_JOB.needCosts.energy,
    );
  });

  it("applies the desk bonus additively to the neutral mood multiplier", () => {
    const initial = {
      ...createInitialPetState(0),
      needs: { ...createInitialPetState(0).needs, mood: 50 },
    };
    const withoutDesk = advancePetState(
      startPrototypeStudy(initial, 0, NO_BONUSES),
      PROTOTYPE_STUDY.durationMs,
      PROTOTYPE_STUDY.durationMs,
    );
    const withDesk = advancePetState(
      startPrototypeStudy(initial, 0, FURNITURE_BONUSES),
      PROTOTYPE_STUDY.durationMs,
      PROTOTYPE_STUDY.durationMs,
    );

    expect(withoutDesk.knowledge["core:general"]).toBeCloseTo(10);
    expect(withDesk.knowledge["core:general"]).toBeCloseTo(10.5);
    expect(withDesk.activity).toBeNull();
  });

  it("produces the same study result for one tick or many ticks", () => {
    const initial = {
      ...createInitialPetState(0),
      needs: { ...createInitialPetState(0).needs, mood: 50 },
    };
    const oneTick = advancePetState(
      startPrototypeStudy(initial, 0, FURNITURE_BONUSES),
      PROTOTYPE_STUDY.durationMs,
      PROTOTYPE_STUDY.durationMs,
    );
    let manyTicks = startPrototypeStudy(initial, 0, FURNITURE_BONUSES);
    for (let second = 1; second <= 15; second += 1) {
      manyTicks = advancePetState(manyTicks, 1_000, second * 1_000);
    }

    expect(manyTicks.knowledge["core:general"]).toBeCloseTo(
      oneTick.knowledge["core:general"] ?? 0,
      8,
    );
    for (const need of Object.keys(oneTick.needs) as Array<
      keyof typeof oneTick.needs
    >) {
      expect(manyTicks.needs[need]).toBeCloseTo(oneTick.needs[need], 8);
    }
  });

  it("applies the bed bonus to gross rest recovery with deterministic ticks", () => {
    const initial = {
      ...createInitialPetState(0),
      needs: { ...createInitialPetState(0).needs, energy: 70 },
    };
    const oneTick = advancePetState(
      startPrototypeRest(initial, 0, FURNITURE_BONUSES),
      PROTOTYPE_REST.durationMs,
      PROTOTYPE_REST.durationMs,
    );
    let manyTicks = startPrototypeRest(initial, 0, FURNITURE_BONUSES);
    for (let second = 1; second <= 15; second += 1) {
      manyTicks = advancePetState(manyTicks, 1_000, second * 1_000);
    }
    const passiveDecay = 1.5 * (PROTOTYPE_REST.durationMs / 3_600_000);

    expect(oneTick.needs.energy).toBeCloseTo(70 + 15.75 - passiveDecay, 8);
    expect(manyTicks.needs.energy).toBeCloseTo(oneTick.needs.energy, 8);
    expect(manyTicks.activity).toBeNull();
  });

  it("stops rest early when recovery reaches full energy", () => {
    const initial = {
      ...createInitialPetState(0),
      needs: { ...createInitialPetState(0).needs, energy: 99 },
    };
    const rested = advancePetState(
      startPrototypeRest(initial, 0, FURNITURE_BONUSES),
      1_000,
      1_000,
    );

    expect(rested.activity).toBeNull();
    expect(rested.statusText).toBe("Fully rested.");
    expect(rested.needs.energy).toBeGreaterThan(99.99);
    expect(rested.needs.energy).toBeLessThanOrEqual(100);
  });

  it("keeps proportional study and rest gains after cancellation", () => {
    const initial = {
      ...createInitialPetState(0),
      needs: { ...createInitialPetState(0).needs, energy: 50, mood: 50 },
    };
    const studied = advancePetState(
      startPrototypeStudy(initial, 0, FURNITURE_BONUSES),
      7_500,
      7_500,
    );
    const rested = advancePetState(
      startPrototypeRest(initial, 0, FURNITURE_BONUSES),
      7_500,
      7_500,
    );

    expect(
      cancelActiveActivity(studied).knowledge["core:general"],
    ).toBeCloseTo(5.25);
    expect(cancelActiveActivity(rested).needs.energy).toBeGreaterThan(57.8);
  });
});
