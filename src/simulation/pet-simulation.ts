import rawPrototypeJob from "../../content/core/jobs/prototype-job.json" with {
  type: "json",
};
import rawRest from "../../content/core/activities/rest.json" with {
  type: "json",
};
import rawStudy from "../../content/core/activities/study.json" with {
  type: "json",
};
import {
  JobDefinitionSchema,
  RestDefinitionSchema,
  StudyDefinitionSchema,
  type ActiveActivity,
  type ActivityBonuses,
  type JobDefinition,
  type NeedState,
  type PetState,
  type Presentation,
  type RestDefinition,
  type StudyDefinition,
} from "../shared/contracts.js";

export const PROTOTYPE_JOB = JobDefinitionSchema.parse(rawPrototypeJob);
export const PROTOTYPE_REST = RestDefinitionSchema.parse(rawRest);
export const PROTOTYPE_STUDY = StudyDefinitionSchema.parse(rawStudy);

export const NEED_DECAY_PER_HOUR: Readonly<NeedState> = Object.freeze({
  energy: 1.5,
  hunger: 2,
  mood: 1,
  thirst: 2.5,
});

const HOUR_MS = 60 * 60 * 1000;
const MAX_FURNITURE_BONUS = 0.05;
export const MAX_OFFLINE_ELAPSED_MS = 8 * HOUR_MS;
export const OFFLINE_NEED_RATE = 0.5;

function clampNeed(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function applyNeedDelta(
  needs: NeedState,
  delta: NeedState,
  multiplier: number,
): NeedState {
  return {
    energy: clampNeed(needs.energy - delta.energy * multiplier),
    hunger: clampNeed(needs.hunger - delta.hunger * multiplier),
    mood: clampNeed(needs.mood - delta.mood * multiplier),
    thirst: clampNeed(needs.thirst - delta.thirst * multiplier),
  };
}

function boundedBonus(value: number): number {
  return Math.min(MAX_FURNITURE_BONUS, Math.max(0, value));
}

export function moodStudyMultiplier(mood: number): number {
  return 0.75 + clampNeed(mood) / 200;
}

export function presentationForActivity(
  activity: ActiveActivity | null,
): Presentation {
  if (activity === null) return "idle";
  if (activity.type === "study") return "studying";
  if (activity.type === "rest") return "resting";
  return "working";
}

export function activityDisplayName(activity: ActiveActivity): string {
  if (activity.type === "study") return PROTOTYPE_STUDY.name;
  if (activity.type === "rest") return PROTOTYPE_REST.name;
  return PROTOTYPE_JOB.name;
}

export function createInitialPetState(now: number): PetState {
  return {
    activity: null,
    knowledge: { "core:general": 0 },
    mastery: 0,
    needs: {
      energy: 88,
      hunger: 82,
      mood: 90,
      thirst: 78,
    },
    petId: "prototype-pet",
    presentation: "idle",
    presentationUntil: null,
    randomSeed: 0x5eed,
    stateVersion: 0,
    statusText: "Ready to play.",
    updatedAt: now,
    wallet: 0,
  };
}

export function startPrototypeJob(
  state: PetState,
  now: number,
  definition: JobDefinition = PROTOTYPE_JOB,
): PetState {
  if (state.activity !== null) return state;

  if (state.needs.energy < 10) {
    return { ...state, statusText: "Too tired to work." };
  }

  return {
    ...state,
    activity: {
      accumulatedMs: 0,
      creditedCoins: 0,
      creditedMastery: 0,
      definitionId: definition.id,
      durationMs: definition.durationMs,
      startedAt: now,
      type: "job",
    },
    presentation: "working",
    presentationUntil: null,
    statusText: `Working: ${definition.name}`,
  };
}

export function startPrototypeStudy(
  state: PetState,
  now: number,
  bonuses: ActivityBonuses,
  definition: StudyDefinition = PROTOTYPE_STUDY,
): PetState {
  if (state.activity !== null) return state;
  if (state.needs.energy < 10) {
    return { ...state, statusText: "Too tired to study." };
  }

  return {
    ...state,
    activity: {
      accumulatedMs: 0,
      creditedKnowledge: 0,
      definitionId: definition.id,
      durationMs: definition.durationMs,
      gainMultiplier:
        moodStudyMultiplier(state.needs.mood) + boundedBonus(bonuses.studyGain),
      knowledgeFieldId: definition.knowledgeFieldId,
      startedAt: now,
      type: "study",
    },
    presentation: "studying",
    presentationUntil: null,
    statusText: `Studying: ${definition.name}`,
  };
}

export function startPrototypeRest(
  state: PetState,
  now: number,
  bonuses: ActivityBonuses,
  definition: RestDefinition = PROTOTYPE_REST,
): PetState {
  if (state.activity !== null) return state;
  if (state.needs.energy >= 100) {
    return { ...state, statusText: "Already fully rested." };
  }

  return {
    ...state,
    activity: {
      accumulatedMs: 0,
      creditedEnergy: 0,
      definitionId: definition.id,
      durationMs: definition.durationMs,
      gainMultiplier: 1 + boundedBonus(bonuses.restRecovery),
      startedAt: now,
      type: "rest",
    },
    presentation: "resting",
    presentationUntil: null,
    statusText: "Resting.",
  };
}

export function cancelActiveActivity(state: PetState): PetState {
  if (state.activity === null) return state;
  const name = activityDisplayName(state.activity);
  return {
    ...state,
    activity: null,
    presentation: "idle",
    presentationUntil: null,
    statusText: `${name} cancelled. Partial progress kept.`,
  };
}

export function applyOfflineNeedDecay(
  state: PetState,
  elapsedMs: number,
  now: number,
  rate = OFFLINE_NEED_RATE,
): PetState {
  const boundedElapsedMs = Math.min(
    MAX_OFFLINE_ELAPSED_MS,
    Math.max(0, elapsedMs),
  );

  return {
    ...state,
    needs: applyNeedDelta(
      state.needs,
      NEED_DECAY_PER_HOUR,
      (boundedElapsedMs / HOUR_MS) * rate,
    ),
    presentation: presentationForActivity(state.activity),
    presentationUntil: null,
    updatedAt: now,
  };
}

function advanceRest(
  state: PetState,
  elapsedMs: number,
  now: number,
  definition: RestDefinition,
  passiveNeedMultiplier: number,
): PetState {
  if (state.activity?.type !== "rest") return state;
  const activity = state.activity;
  const remainingActivityMs = Math.max(
    0,
    activity.durationMs - activity.accumulatedMs,
  );
  const activeBudgetMs = Math.min(elapsedMs, remainingActivityMs);
  const recoveryPerMs =
    (definition.recoveryEnergy * activity.gainMultiplier) /
    activity.durationMs;
  const decayPerMs =
    (NEED_DECAY_PER_HOUR.energy * passiveNeedMultiplier) / HOUR_MS;
  const netRecoveryPerMs = recoveryPerMs - decayPerMs;
  const timeToFullMs =
    netRecoveryPerMs > 0
      ? Math.max(0, (100 - state.needs.energy) / netRecoveryPerMs)
      : Number.POSITIVE_INFINITY;
  const activeElapsedMs = Math.min(activeBudgetMs, timeToFullMs);
  const reachedFull = timeToFullMs <= activeBudgetMs;
  const nextAccumulatedMs = activity.accumulatedMs + activeElapsedMs;
  const completed = reachedFull || nextAccumulatedMs >= activity.durationMs;
  const grossRecovery = recoveryPerMs * activeElapsedMs;
  const needsAfterDecay = applyNeedDelta(
    state.needs,
    NEED_DECAY_PER_HOUR,
    (elapsedMs / HOUR_MS) * passiveNeedMultiplier,
  );
  const needs = {
    ...needsAfterDecay,
    energy: clampNeed(needsAfterDecay.energy + grossRecovery),
  };

  return {
    ...state,
    activity: completed
      ? null
      : {
          ...activity,
          accumulatedMs: nextAccumulatedMs,
          creditedEnergy: activity.creditedEnergy + grossRecovery,
        },
    needs,
    presentation: completed ? "idle" : state.presentation,
    presentationUntil: completed ? null : state.presentationUntil,
    statusText: completed
      ? reachedFull
        ? "Fully rested."
        : `Completed ${definition.name}.`
      : state.statusText,
    updatedAt: now,
  };
}

export function advancePetState(
  state: PetState,
  elapsedMs: number,
  now: number,
  passiveNeedMultiplier = 1,
  jobDefinition: JobDefinition = PROTOTYPE_JOB,
  studyDefinition: StudyDefinition = PROTOTYPE_STUDY,
  restDefinition: RestDefinition = PROTOTYPE_REST,
): PetState {
  const safeElapsedMs = Math.max(0, elapsedMs);
  if (state.activity?.type === "rest") {
    return advanceRest(
      state,
      safeElapsedMs,
      now,
      restDefinition,
      passiveNeedMultiplier,
    );
  }

  let needs = applyNeedDelta(
    state.needs,
    NEED_DECAY_PER_HOUR,
    (safeElapsedMs / HOUR_MS) * passiveNeedMultiplier,
  );
  let activity = state.activity;
  let knowledge = state.knowledge;
  let mastery = state.mastery;
  let wallet = state.wallet;
  let presentation = state.presentation;
  let presentationUntil = state.presentationUntil;
  let statusText = state.statusText;

  if (
    presentationUntil !== null &&
    now >= presentationUntil &&
    presentation !== "dragged"
  ) {
    presentation = presentationForActivity(activity);
    presentationUntil = null;
  }

  if (activity !== null) {
    const remainingMs = Math.max(0, activity.durationMs - activity.accumulatedMs);
    const activeElapsedMs = Math.min(safeElapsedMs, remainingMs);
    const nextAccumulatedMs = activity.accumulatedMs + activeElapsedMs;
    const progress = nextAccumulatedMs / activity.durationMs;

    if (activity.type === "job") {
      const targetCoins = jobDefinition.rewardCoins * progress;
      const targetMastery = jobDefinition.rewardMastery * progress;
      needs = applyNeedDelta(
        needs,
        jobDefinition.needCosts,
        activeElapsedMs / activity.durationMs,
      );
      wallet += targetCoins - activity.creditedCoins;
      mastery += targetMastery - activity.creditedMastery;
      if (nextAccumulatedMs >= activity.durationMs) {
        mastery += jobDefinition.completionMasteryBonus;
        activity = null;
        statusText = `Completed ${jobDefinition.name}!`;
      } else {
        activity = {
          ...activity,
          accumulatedMs: nextAccumulatedMs,
          creditedCoins: targetCoins,
          creditedMastery: targetMastery,
        };
      }
    } else {
      const targetKnowledge =
        studyDefinition.rewardKnowledge * activity.gainMultiplier * progress;
      needs = applyNeedDelta(
        needs,
        studyDefinition.needCosts,
        activeElapsedMs / activity.durationMs,
      );
      knowledge = {
        ...knowledge,
        [activity.knowledgeFieldId]:
          (knowledge[activity.knowledgeFieldId] ?? 0) +
          targetKnowledge -
          activity.creditedKnowledge,
      };
      if (nextAccumulatedMs >= activity.durationMs) {
        activity = null;
        statusText = `Completed ${studyDefinition.name}.`;
      } else {
        activity = {
          ...activity,
          accumulatedMs: nextAccumulatedMs,
          creditedKnowledge: targetKnowledge,
        };
      }
    }

    if (activity === null) {
      presentation = "idle";
      presentationUntil = null;
    } else if (presentation !== "petted") {
      presentation = presentationForActivity(activity);
    }
  }

  return {
    ...state,
    activity,
    knowledge,
    mastery,
    needs,
    presentation,
    presentationUntil,
    statusText,
    updatedAt: now,
    wallet,
  };
}
