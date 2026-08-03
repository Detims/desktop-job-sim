import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import {
  ADMINISTRATIVE_ASSISTANT_EXAM,
  attemptExam,
  examProbability,
  reconcileTimedState,
} from "./exam.js";

function readyState(knowledge: number) {
  const state = createInitialPetState(1_000);
  return {
    ...state,
    knowledge: {
      ...state.knowledge,
      "core:business-administration": knowledge,
    },
  };
}

describe("qualification exams", () => {
  it("rejects attempts below the risk threshold", () => {
    expect(() =>
      attemptExam(readyState(7.99), ADMINISTRATIVE_ASSISTANT_EXAM.id, 2_000),
    ).toThrow("Requires 8 knowledge");
  });

  it("uses a bounded deterministic risk outcome and advances the seed once", () => {
    const state = { ...readyState(8), randomSeed: 1_000 };
    const result = attemptExam(state, ADMINISTRATIVE_ASSISTANT_EXAM.id, 2_000);

    expect(examProbability(state, ADMINISTRATIVE_ASSISTANT_EXAM.id)).toBe(0.4);
    expect(result.outcome).toBe("failed");
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
    expect(result.state.needs).toMatchObject({ energy: 78, mood: 80 });
    expect(result.state.conditions["core:discouraged"]?.expiresAt).toBe(602_000);
    expect(result.state.examCooldowns[ADMINISTRATIVE_ASSISTANT_EXAM.id]).toBe(302_000);
  });

  it("guarantees passing without consuming the random seed", () => {
    const state = { ...readyState(15), randomSeed: 1_000 };
    const result = attemptExam(state, ADMINISTRATIVE_ASSISTANT_EXAM.id, 2_000);

    expect(result.outcome).toBe("passed_guaranteed");
    expect(result.state.randomSeed).toBe(1_000);
    expect(
      result.state.qualifications["core:administrative-assistant-certification"],
    ).toMatchObject({ earnedAt: 2_000 });
    expect(() =>
      attemptExam(result.state, ADMINISTRATIVE_ASSISTANT_EXAM.id, 3_000),
    ).toThrow("already been passed");
  });

  it("expires cooldowns and conditions using persisted wall-clock timestamps", () => {
    const failed = attemptExam(
      { ...readyState(8), randomSeed: 1_000 },
      ADMINISTRATIVE_ASSISTANT_EXAM.id,
      2_000,
    ).state;

    expect(reconcileTimedState(failed, 302_000).examCooldowns).toEqual({});
    expect(reconcileTimedState(failed, 302_000).conditions).not.toEqual({});
    expect(reconcileTimedState(failed, 602_000)).toMatchObject({
      conditions: {},
      examCooldowns: {},
    });
  });
});
