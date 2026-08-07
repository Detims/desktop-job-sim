import rawAdministrativeExam from "../../content/core/exams/administrative-assistant.json" with { type: "json" };
import {
  ExamDefinitionSchema,
  type ExamDefinition,
  type PetState,
} from "../shared/contracts.js";
import { assertSafeForMajorActivity } from "./care.js";
import {
  assertNotBurnedOutForExam,
  reconcileBurnoutState,
} from "./burnout.js";

export const ADMINISTRATIVE_ASSISTANT_EXAM =
  ExamDefinitionSchema.parse(rawAdministrativeExam);

const exams = new Map<string, ExamDefinition>([
  [ADMINISTRATIVE_ASSISTANT_EXAM.id, ADMINISTRATIVE_ASSISTANT_EXAM],
]);

export class ExamRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ExamRuleError";
  }
}

export type ExamOutcome = "failed" | "passed_guaranteed" | "passed_risk";

export interface ExamResolution {
  definition: ExamDefinition;
  outcome: ExamOutcome;
  probability: number;
  state: PetState;
}

export function getExamDefinition(examId: string): ExamDefinition {
  const definition = exams.get(examId);
  if (definition === undefined) {
    throw new ExamRuleError("exam.unknown", "That exam is unavailable.");
  }
  return definition;
}

export function reconcileTimedState(state: PetState, now: number): PetState {
  state = reconcileBurnoutState(state, now);
  const conditions = Object.fromEntries(
    Object.entries(state.conditions).filter(([, value]) => value.expiresAt > now),
  );
  const examCooldowns = Object.fromEntries(
    Object.entries(state.examCooldowns).filter(([, expiresAt]) => expiresAt > now),
  );
  return Object.keys(conditions).length === Object.keys(state.conditions).length &&
    Object.keys(examCooldowns).length === Object.keys(state.examCooldowns).length
    ? state
    : { ...state, conditions, examCooldowns };
}

export function examProbability(state: PetState, examId: string): number {
  const definition = getExamDefinition(examId);
  const knowledge = state.knowledge[definition.knowledgeFieldId] ?? 0;
  if (knowledge >= definition.guaranteedKnowledge) return 1;
  if (knowledge < definition.riskMinimumKnowledge) return 0;
  const progress =
    (knowledge - definition.riskMinimumKnowledge) /
    (definition.guaranteedKnowledge - definition.riskMinimumKnowledge);
  return (
    definition.riskChanceMinimum +
    (definition.riskChanceMaximum - definition.riskChanceMinimum) * progress
  );
}

function nextRandom(seed: number): { nextSeed: number; value: number } {
  const nextSeed = (Math.imul(seed >>> 0, 1_664_525) + 1_013_904_223) >>> 0;
  return { nextSeed, value: nextSeed / 0x1_0000_0000 };
}

export function attemptExam(
  rawState: PetState,
  examId: string,
  now: number,
): ExamResolution {
  const state = reconcileTimedState(rawState, now);
  assertSafeForMajorActivity(state);
  assertNotBurnedOutForExam(state);
  const definition = getExamDefinition(examId);
  const knowledge = state.knowledge[definition.knowledgeFieldId] ?? 0;
  if (state.activity !== null) {
    throw new ExamRuleError("exam.activity_active", "Finish or cancel the current activity first.");
  }
  if (state.qualifications[definition.qualificationId] !== undefined) {
    throw new ExamRuleError("exam.already_passed", "This exam has already been passed.");
  }
  if ((state.examCooldowns[examId] ?? 0) > now) {
    throw new ExamRuleError("exam.cooldown", "This exam is still on cooldown.");
  }
  if (knowledge < definition.riskMinimumKnowledge) {
    throw new ExamRuleError("exam.knowledge", `Requires ${definition.riskMinimumKnowledge} knowledge to attempt.`);
  }
  if (state.needs.energy < definition.minimumEnergy) {
    throw new ExamRuleError("exam.energy", `Requires ${definition.minimumEnergy} energy.`);
  }
  if (state.needs.mood < definition.minimumMood) {
    throw new ExamRuleError("exam.mood", `Requires ${definition.minimumMood} mood.`);
  }
  if (state.household.wallet < definition.coinCost) {
    throw new ExamRuleError("exam.coins", `Requires ${definition.coinCost} coins.`);
  }

  const probability = examProbability(state, examId);
  const guaranteed = probability === 1;
  const random = guaranteed ? null : nextRandom(state.randomSeed);
  const passed = guaranteed || (random?.value ?? 1) < probability;
  const paidState: PetState = {
    ...state,
    needs: {
      ...state.needs,
      energy: Math.max(0, state.needs.energy - definition.energyCost),
    },
    randomSeed: random?.nextSeed ?? state.randomSeed,
    updatedAt: now,
    household: {
      ...state.household,
      wallet: state.household.wallet - definition.coinCost,
    },
  };

  if (passed) {
    return {
      definition,
      outcome: guaranteed ? "passed_guaranteed" : "passed_risk",
      probability,
      state: {
        ...paidState,
        qualifications: {
          ...paidState.qualifications,
          [definition.qualificationId]: {
            earnedAt: now,
            qualificationId: definition.qualificationId,
          },
        },
        statusText: `Passed ${definition.name}.`,
      },
    };
  }

  return {
    definition,
    outcome: "failed",
    probability,
    state: {
      ...paidState,
      conditions: {
        ...paidState.conditions,
        [definition.condition.id]: {
          conditionId: definition.condition.id,
          expiresAt: now + definition.condition.durationMs,
        },
      },
      examCooldowns: {
        ...paidState.examCooldowns,
        [definition.id]: now + definition.cooldownMs,
      },
      needs: {
        ...paidState.needs,
        mood: Math.max(0, paidState.needs.mood - definition.failureMoodCost),
      },
      statusText: `${definition.name} was not passed. Try again after the cooldown.`,
    },
  };
}

export function activeStudyConditionMultiplier(state: PetState): number {
  return Object.keys(state.conditions).includes(
    ADMINISTRATIVE_ASSISTANT_EXAM.condition.id,
  )
    ? ADMINISTRATIVE_ASSISTANT_EXAM.condition.studyMultiplier
    : 1;
}
