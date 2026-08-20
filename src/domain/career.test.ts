import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import {
  ADMINISTRATIVE_ASSISTANT_CAREER,
  CLERK_CAREER,
  CLERK_JOBS,
  CareerRuleError,
  careerMemoryDrafts,
  enrollCareer,
  isCareerJobUnlocked,
  promoteCareer,
  reconcileCareerProgression,
} from "./career.js";

function knowledgeableState(knowledge = 5) {
  const state = createInitialPetState(0);
  return {
    ...state,
    knowledge: { ...state.knowledge, "core:general": knowledge },
  };
}

describe("Clerk career progression", () => {
  it("requires five General Knowledge to enroll", () => {
    expect(() => enrollCareer(createInitialPetState(0), CLERK_CAREER.id, 1))
      .toThrowError(CareerRuleError);
    const enrolled = enrollCareer(knowledgeableState(), CLERK_CAREER.id, 1);
    expect(enrolled.careers[CLERK_CAREER.id]).toEqual({
      careerId: CLERK_CAREER.id,
      enrolledAt: 1,
      mastery: 0,
      promotionReadyAt: null,
      rankId: "core:clerk:junior",
    });
  });

  it("automatically advances to Clerk when both requirements are met", () => {
    const enrolled = enrollCareer(knowledgeableState(10), CLERK_CAREER.id, 1);
    const qualified = {
      ...enrolled,
      careers: {
        ...enrolled.careers,
        [CLERK_CAREER.id]: {
          ...enrolled.careers[CLERK_CAREER.id]!,
          mastery: 20,
        },
      },
    };
    const advanced = reconcileCareerProgression(qualified, 2);
    expect(advanced.careers[CLERK_CAREER.id]?.rankId).toBe("core:clerk:clerk");
    expect(careerMemoryDrafts(qualified, advanced)).toEqual([
      expect.objectContaining({
        category: "home",
        title: "Clerk Filing Cabinet Unlocked",
      }),
    ]);
  });

  it("marks Senior promotion ready but never promotes automatically", () => {
    const enrolled = enrollCareer(knowledgeableState(25), CLERK_CAREER.id, 1);
    const qualified = {
      ...enrolled,
      careers: {
        [CLERK_CAREER.id]: {
          ...enrolled.careers[CLERK_CAREER.id]!,
          mastery: 60,
        },
      },
    };
    const ready = reconcileCareerProgression(qualified, 5);
    expect(ready.careers[CLERK_CAREER.id]).toMatchObject({
      promotionReadyAt: 5,
      rankId: "core:clerk:clerk",
    });
    const promoted = promoteCareer(ready, CLERK_CAREER.id);
    expect(promoted.careers[CLERK_CAREER.id]).toMatchObject({
      promotionReadyAt: null,
      rankId: "core:clerk:senior",
    });
  });

  it("unlocks jobs by attained rank without relocking earlier work", () => {
    const enrolled = enrollCareer(knowledgeableState(5), CLERK_CAREER.id, 1);
    expect(CLERK_JOBS.map((job) => isCareerJobUnlocked(enrolled, job)))
      .toEqual([true, false, false]);
    const senior = {
      ...enrolled,
      careers: {
        [CLERK_CAREER.id]: {
          ...enrolled.careers[CLERK_CAREER.id]!,
          rankId: "core:clerk:senior",
        },
      },
    };
    expect(CLERK_JOBS.every((job) => isCareerJobUnlocked(senior, job))).toBe(true);
  });
});

describe("Administrative Assistant career progression", () => {
  it("requires the certification before explicit enrollment", () => {
    const state = knowledgeableState(25);
    expect(() =>
      enrollCareer(state, ADMINISTRATIVE_ASSISTANT_CAREER.id, 1),
    ).toThrow("qualification exam");

    const qualified = {
      ...state,
      qualifications: {
        "core:administrative-assistant-certification": {
          earnedAt: 1,
          qualificationId: "core:administrative-assistant-certification",
        },
      },
    };
    expect(
      enrollCareer(qualified, ADMINISTRATIVE_ASSISTANT_CAREER.id, 2).careers[
        ADMINISTRATIVE_ASSISTANT_CAREER.id
      ]?.rankId,
    ).toBe("core:administrative-assistant:assistant");
  });
});
