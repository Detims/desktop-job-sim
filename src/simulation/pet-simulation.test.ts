import { describe, expect, it } from "vitest";

import {
  advancePetState,
  cancelActiveActivity,
  createInitialPetState,
  DATA_ENTRY_JOB,
  PROTOTYPE_REST,
  PROTOTYPE_STUDY,
  PROTOTYPE_JOB,
  PROTOTYPE_PLAY,
  startPrototypeJob,
  startPrototypePlay,
  startPrototypeRest,
  startPrototypeStudy,
  startJob,
  startStudy,
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

    expect(halfway.household.wallet).toBeCloseTo(5);
    expect(halfway.careers[CLERK_CAREER.id]?.mastery).toBeCloseTo(5);
    expect(halfway.mastery).toBe(0);
    expect(halfway.generalXp).toBeCloseTo(CLERK_JOBS[0]!.rewardGeneralXp / 2);
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

    expect(manyTicks.household.wallet).toBeCloseTo(oneTick.household.wallet, 8);
    expect(manyTicks.mastery).toBeCloseTo(oneTick.mastery, 8);
    expect(manyTicks.generalXp).toBeCloseTo(oneTick.generalXp, 8);
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

    expect(cancelled.household.wallet).toBeCloseTo(PROTOTYPE_JOB.rewardCoins / 2);
    expect(cancelled.mastery).toBeCloseTo(PROTOTYPE_JOB.rewardMastery / 2);
    expect(cancelled.generalXp).toBeCloseTo(PROTOTYPE_JOB.rewardGeneralXp / 2);
    expect(later.household.wallet).toBeCloseTo(cancelled.household.wallet);
    expect(later.mastery).toBeCloseTo(cancelled.mastery);
    expect(later.activity).toBeNull();
  });

  it("keeps General XP neutral to study modifiers", () => {
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

    expect(withoutDesk.generalXp).toBe(PROTOTYPE_STUDY.rewardGeneralXp);
    expect(withDesk.generalXp).toBe(PROTOTYPE_STUDY.rewardGeneralXp);
  });

  it("gates Data Entry at Level 2 and awards its configured rewards", () => {
    const levelOne = createInitialPetState(0);
    expect(() => startJob(levelOne, 0, DATA_ENTRY_JOB.id)).toThrow(
      "requires Level 2",
    );

    const levelTwo = { ...levelOne, generalXp: 50 };
    const halfway = advancePetState(
      startJob(levelTwo, 0, DATA_ENTRY_JOB.id),
      DATA_ENTRY_JOB.durationMs / 2,
      DATA_ENTRY_JOB.durationMs / 2,
    );

    expect(halfway.generalXp).toBeCloseTo(50 + DATA_ENTRY_JOB.rewardGeneralXp / 2);
    expect(halfway.household.wallet).toBeCloseTo(DATA_ENTRY_JOB.rewardCoins / 2);
    expect(halfway.mastery).toBeCloseTo(DATA_ENTRY_JOB.rewardMastery / 2);
  });

  it("settles proportional work before Serious Illness interrupts it", () => {
    const initial = createInitialPetState(1_000);
    const working = startPrototypeJob({
      ...initial,
      care: { ...initial.care, health: 19 },
    }, 1_000);
    const interrupted = advancePetState(working, 5_000, 6_000);

    expect(interrupted.activity).toBeNull();
    expect(interrupted.care.seriousIllness).not.toBeNull();
    expect(interrupted.household.wallet).toBeCloseTo(
      PROTOTYPE_JOB.rewardCoins / 3,
    );
    expect(interrupted.mastery).toBeCloseTo(PROTOTYPE_JOB.rewardMastery / 3);
  });

  it("adds the completion-only mastery bonus exactly once", () => {
    const completed = advanceInSteps(1, PROTOTYPE_JOB.durationMs);
    const later = advancePetState(
      completed,
      PROTOTYPE_JOB.durationMs,
      completed.updatedAt + PROTOTYPE_JOB.durationMs,
    );

    expect(completed.household.wallet).toBeCloseTo(PROTOTYPE_JOB.rewardCoins);
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

  it("applies Discouraged after mood and furniture study modifiers", () => {
    const initial = createInitialPetState(0);
    const discouraged = {
      ...initial,
      conditions: {
        "core:discouraged": {
          conditionId: "core:discouraged",
          expiresAt: 60_000,
        },
      },
    };
    const completed = advancePetState(
      startStudy(
        discouraged,
        0,
        FURNITURE_BONUSES,
        "core:business-fundamentals",
      ),
      15_000,
      15_000,
    );

    expect(completed.knowledge["core:business-administration"]).toBeCloseTo(11.25);
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
    expect(rested.generalXp).toBeGreaterThan(0);
    expect(rested.generalXp).toBeLessThan(PROTOTYPE_REST.rewardGeneralXp);
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

  it("settles Play gains and costs proportionally and deterministically", () => {
    const initial = {
      ...createInitialPetState(0),
      care: { ...createInitialPetState(0).care, stress: 30 },
      needs: { ...createInitialPetState(0).needs, mood: 50 },
    };
    const halfway = advancePetState(
      startPrototypePlay(initial, 0),
      PROTOTYPE_PLAY.durationMs / 2,
      PROTOTYPE_PLAY.durationMs / 2,
    );
    const cancelled = cancelActiveActivity(halfway);

    expect(cancelled.relationship.affection).toBeCloseTo(54 - 0.5 / 120);
    expect(cancelled.relationship.bond).toBeCloseTo(0.5);
    expect(cancelled.needs.mood).toBeCloseTo(54 - 0.5 / 120);
    expect(cancelled.needs.energy).toBeCloseTo(85.5 - 0.5 / 80);
    expect(cancelled.care.stress).toBeCloseTo(25);
    expect(cancelled.generalXp).toBeCloseTo(PROTOTYPE_PLAY.rewardGeneralXp / 2);
    expect(cancelled.activity).toBeNull();

    let stepped = startPrototypePlay(initial, 0);
    for (let second = 1; second <= 30; second += 1) {
      stepped = advancePetState(stepped, 1_000, second * 1_000);
    }
    const oneTick = advancePetState(
      startPrototypePlay(initial, 0),
      PROTOTYPE_PLAY.durationMs,
      PROTOTYPE_PLAY.durationMs,
    );
    expect(stepped.relationship.affection).toBeCloseTo(oneTick.relationship.affection, 8);
    expect(stepped.relationship.bond).toBeCloseTo(oneTick.relationship.bond, 8);
    expect(stepped.needs.energy).toBeCloseTo(oneTick.needs.energy, 8);
    expect(stepped.care.stress).toBeCloseTo(oneTick.care.stress, 8);
  });

  it("applies Burnout modifiers without reducing stress or relationship recovery", () => {
    const initial = createInitialPetState(0);
    const burnedOut = {
      ...initial,
      care: { ...initial.care, stress: 40 },
      conditions: {
        "core:burnout": {
          conditionId: "core:burnout",
          expiresAt: 1_000_000,
        },
      },
      needs: { ...initial.needs, energy: 50, mood: 50 },
    };
    const studied = advancePetState(
      startPrototypeStudy(burnedOut, 0, NO_BONUSES),
      PROTOTYPE_STUDY.durationMs,
      PROTOTYPE_STUDY.durationMs,
    );
    const rested = advancePetState(
      startPrototypeRest(burnedOut, 0, NO_BONUSES),
      PROTOTYPE_REST.durationMs,
      PROTOTYPE_REST.durationMs,
    );
    const played = advancePetState(
      startPrototypePlay(burnedOut, 0),
      PROTOTYPE_PLAY.durationMs,
      PROTOTYPE_PLAY.durationMs,
    );
    const passiveDecay = 1.5 * (PROTOTYPE_REST.durationMs / 3_600_000);

    expect(studied.knowledge["core:general"]).toBeCloseTo(7.5);
    expect(rested.needs.energy).toBeCloseTo(50 + 12 - passiveDecay);
    expect(rested.care.stress).toBeCloseTo(32);
    expect(played.needs.mood).toBeCloseTo(56 - 0.5 / 120);
    expect(played.care.stress).toBeCloseTo(30);
    expect(played.relationship.affection).toBeCloseTo(58 - 0.5 / 120);
    expect(played.relationship.bond).toBeCloseTo(1);
    expect(played.conditions["core:burnout"]?.expiresAt).toBe(880_000);
  });

  it("blocks demanding activities during Burnout but permits low-tier ones", () => {
    const initial = createInitialPetState(0);
    const burnedOut = {
      ...initial,
      conditions: {
        "core:burnout": {
          conditionId: "core:burnout",
          expiresAt: 600_000,
        },
      },
    };

    expect(() =>
      startStudy(burnedOut, 0, NO_BONUSES, "core:business-fundamentals"),
    ).toThrow("Burnout blocks demanding");
    expect(startPrototypeStudy(burnedOut, 0, NO_BONUSES).activity?.type)
      .toBe("study");
    expect(startPrototypeJob(burnedOut, 0).activity?.type).toBe("job");
  });

  it("counts only the portion of work elapsed at or above 75 stress", () => {
    const initial = createInitialPetState(0);
    const working = startPrototypeJob({
      ...initial,
      care: { ...initial.care, stress: 74 },
    }, 0);
    const completed = advancePetState(
      working,
      PROTOTYPE_JOB.durationMs,
      PROTOTYPE_JOB.durationMs,
    );

    expect(completed.care.overworkExposureMs).toBeCloseTo(10_000);
  });
});
