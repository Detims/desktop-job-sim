import rawPrototypeJob from "../../content/core/jobs/prototype-job.json" with {
  type: "json",
};
import rawRest from "../../content/core/activities/rest.json" with {
  type: "json",
};
import rawPlay from "../../content/core/activities/play.json" with {
  type: "json",
};
import {
  JobDefinitionSchema,
  PlayDefinitionSchema,
  RestDefinitionSchema,
  type ActiveActivity,
  type ActivityBonuses,
  type JobDefinition,
  type NeedState,
  type PetState,
  type PlayDefinition,
  type Presentation,
  type RestDefinition,
  type StudyDefinition,
} from "../shared/contracts.js";
import {
  getCareerJobDefinition,
  isCareerJobUnlocked,
  reconcileCareerProgression,
} from "../domain/career.js";
import {
  activeStudyConditionMultiplier,
  reconcileTimedState,
} from "../domain/exam.js";
import { getStudyDefinition } from "../domain/study.js";
import {
  applyCareElapsed,
  assertSafeForMajorActivity,
} from "../domain/care.js";
import {
  applyAffectionElapsed,
  applyRelationshipGain,
} from "../domain/relationship.js";

export const PROTOTYPE_JOB = JobDefinitionSchema.parse(rawPrototypeJob);
export const PROTOTYPE_REST = RestDefinitionSchema.parse(rawRest);
export const PROTOTYPE_PLAY = PlayDefinitionSchema.parse(rawPlay);
export const PROTOTYPE_STUDY = getStudyDefinition("core:general-study");

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
  if (activity.type === "play") return "playing";
  return "working";
}

export function activityDisplayName(activity: ActiveActivity): string {
  if (activity.type === "study") return PROTOTYPE_STUDY.name;
  if (activity.type === "rest") return PROTOTYPE_REST.name;
  if (activity.type === "play") return PROTOTYPE_PLAY.name;
  if (activity.type === "careerJob") {
    return getCareerJobDefinition(activity.definitionId).name;
  }
  return PROTOTYPE_JOB.name;
}

export function createInitialPetState(now: number): PetState {
  return {
    activity: null,
    care: {
      comfortCooldownUntil: 0,
      criticalExposureMs: { energy: 0, hunger: 0, thirst: 0 },
      health: 100,
      hygiene: 100,
      recoveryProtectedUntil: 0,
      seriousIllness: null,
      stress: 0,
    },
    careers: {},
    conditions: {},
    examCooldowns: {},
    household: { inventory: {}, wallet: 0 },
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
    qualifications: {},
    relationship: {
      affection: 50,
      bond: 0,
      bondAwardDate: "",
      bondAwardedToday: 0,
      growingCloserRecorded: false,
      petCooldownUntil: 0,
      talkCooldownUntil: 0,
    },
    stateVersion: 0,
    statusText: "Ready to play.",
    updatedAt: now,
  };
}

export function startCareerJob(
  state: PetState,
  now: number,
  jobId: string,
): PetState {
  assertSafeForMajorActivity(state);
  const definition = getCareerJobDefinition(jobId);
  if (state.activity !== null) return state;
  if (!isCareerJobUnlocked(state, definition)) {
    throw new Error("That career job is still locked.");
  }
  if (state.needs.energy < 10) {
    return { ...state, statusText: "Too tired to work." };
  }
  return {
    ...state,
    activity: {
      accumulatedMs: 0,
      careerId: definition.careerId,
      creditedCareerXp: 0,
      creditedCoins: 0,
      definitionId: definition.id,
      durationMs: definition.durationMs,
      startedAt: now,
      type: "careerJob",
    },
    presentation: "working",
    presentationUntil: null,
    statusText: `Working: ${definition.name}`,
  };
}

export function startPrototypeJob(
  state: PetState,
  now: number,
  definition: JobDefinition = PROTOTYPE_JOB,
): PetState {
  assertSafeForMajorActivity(state);
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
  assertSafeForMajorActivity(state);
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
        (moodStudyMultiplier(state.needs.mood) + boundedBonus(bonuses.studyGain)) *
        activeStudyConditionMultiplier(state),
      knowledgeFieldId: definition.knowledgeFieldId,
      startedAt: now,
      type: "study",
    },
    presentation: "studying",
    presentationUntil: null,
    statusText: `Studying: ${definition.name}`,
  };
}

export function startStudy(
  state: PetState,
  now: number,
  bonuses: ActivityBonuses,
  studyId = PROTOTYPE_STUDY.id,
): PetState {
  return startPrototypeStudy(state, now, bonuses, getStudyDefinition(studyId));
}

export function startPrototypeRest(
  state: PetState,
  now: number,
  bonuses: ActivityBonuses,
  definition: RestDefinition = PROTOTYPE_REST,
): PetState {
  assertSafeForMajorActivity(state);
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

export function startPrototypePlay(
  state: PetState,
  now: number,
  definition: PlayDefinition = PROTOTYPE_PLAY,
): PetState {
  assertSafeForMajorActivity(state);
  if (state.activity !== null) return state;
  if (state.needs.energy < definition.energyCost) {
    return { ...state, statusText: "Too tired to play." };
  }
  return {
    ...state,
    activity: {
      accumulatedMs: 0,
      creditedAffection: 0,
      creditedBond: 0,
      creditedEnergyCost: 0,
      creditedMood: 0,
      creditedStressRecovery: 0,
      definitionId: definition.id,
      durationMs: definition.durationMs,
      startedAt: now,
      type: "play",
    },
    presentation: "playing",
    presentationUntil: null,
    statusText: `Playing: ${definition.name}`,
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

  const needs = applyNeedDelta(
    state.needs,
    NEED_DECAY_PER_HOUR,
    (boundedElapsedMs / HOUR_MS) * rate,
  );
  const cared = applyCareElapsed({
    ...state,
    needs,
    presentation: presentationForActivity(state.activity),
    presentationUntil: null,
    updatedAt: now,
  }, needs, boundedElapsedMs, now, rate);
  return applyAffectionElapsed(cared, boundedElapsedMs, rate);
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

  const next = {
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
  return applyCareElapsed(
    next,
    needs,
    elapsedMs,
    now,
    passiveNeedMultiplier,
    -definition.stressRecovery * (activeElapsedMs / activity.durationMs),
  );
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
  state = reconcileTimedState(state, now);
  const safeElapsedMs = Math.max(0, elapsedMs);
  if (state.activity?.type === "rest") {
    return applyAffectionElapsed(
      advanceRest(
        state,
        safeElapsedMs,
        now,
        restDefinition,
        passiveNeedMultiplier,
      ),
      safeElapsedMs,
      passiveNeedMultiplier,
    );
  }

  let needs = applyNeedDelta(
    state.needs,
    NEED_DECAY_PER_HOUR,
    (safeElapsedMs / HOUR_MS) * passiveNeedMultiplier,
  );
  let activity = state.activity;
  let careers = state.careers;
  let knowledge = state.knowledge;
  let mastery = state.mastery;
  let wallet = state.household.wallet;
  let stressDelta = 0;
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
      stressDelta += jobDefinition.stressCost * (activeElapsedMs / activity.durationMs);
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
    } else if (activity.type === "careerJob") {
      const definition = getCareerJobDefinition(activity.definitionId);
      const targetCoins = definition.rewardCoins * progress;
      const targetCareerXp = definition.rewardCareerXp * progress;
      const career = careers[activity.careerId];
      if (career === undefined) {
        throw new Error("Active career job has no enrolled career state.");
      }
      needs = applyNeedDelta(
        needs,
        definition.needCosts,
        activeElapsedMs / activity.durationMs,
      );
      wallet += targetCoins - activity.creditedCoins;
      stressDelta += definition.stressCost * (activeElapsedMs / activity.durationMs);
      careers = {
        ...careers,
        [activity.careerId]: {
          ...career,
          mastery:
            career.mastery + targetCareerXp - activity.creditedCareerXp,
        },
      };
      if (nextAccumulatedMs >= activity.durationMs) {
        careers = {
          ...careers,
          [activity.careerId]: {
            ...careers[activity.careerId]!,
            mastery:
              careers[activity.careerId]!.mastery +
              definition.completionCareerXpBonus,
          },
        };
        activity = null;
        statusText = `Completed ${definition.name}.`;
      } else {
        activity = {
          ...activity,
          accumulatedMs: nextAccumulatedMs,
          creditedCareerXp: targetCareerXp,
          creditedCoins: targetCoins,
        };
      }
    } else if (activity.type === "play") {
      const definition = PROTOTYPE_PLAY;
      const targetAffection = definition.affectionGain * progress;
      const targetBond = definition.bondGain * progress;
      const targetEnergyCost = definition.energyCost * progress;
      const targetMood = definition.moodGain * progress;
      const targetStressRecovery = definition.stressRecovery * progress;
      needs = {
        ...needs,
        energy: clampNeed(
          needs.energy - (targetEnergyCost - activity.creditedEnergyCost),
        ),
        mood: clampNeed(needs.mood + (targetMood - activity.creditedMood)),
      };
      stressDelta -= targetStressRecovery - activity.creditedStressRecovery;
      state = applyRelationshipGain(
        state,
        now,
        targetAffection - activity.creditedAffection,
        targetBond - activity.creditedBond,
      );
      if (nextAccumulatedMs >= activity.durationMs) {
        activity = null;
        statusText = `Completed ${definition.name}.`;
      } else {
        activity = {
          ...activity,
          accumulatedMs: nextAccumulatedMs,
          creditedAffection: targetAffection,
          creditedBond: targetBond,
          creditedEnergyCost: targetEnergyCost,
          creditedMood: targetMood,
          creditedStressRecovery: targetStressRecovery,
        };
      }
    } else {
      const resolvedStudyDefinition =
        activity.definitionId === studyDefinition.id
          ? studyDefinition
          : getStudyDefinition(activity.definitionId);
      const targetKnowledge =
        resolvedStudyDefinition.rewardKnowledge * activity.gainMultiplier * progress;
      needs = applyNeedDelta(
        needs,
        resolvedStudyDefinition.needCosts,
        activeElapsedMs / activity.durationMs,
      );
      knowledge = {
        ...knowledge,
        [activity.knowledgeFieldId]:
          (knowledge[activity.knowledgeFieldId] ?? 0) +
          targetKnowledge -
          activity.creditedKnowledge,
      };
      stressDelta += resolvedStudyDefinition.stressCost * (activeElapsedMs / activity.durationMs);
      if (nextAccumulatedMs >= activity.durationMs) {
        activity = null;
        statusText = `Completed ${resolvedStudyDefinition.name}.`;
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

  const next = applyCareElapsed({
    ...state,
    activity,
    careers,
    household: { ...state.household, wallet },
    knowledge,
    mastery,
    needs,
    presentation,
    presentationUntil,
    statusText,
    updatedAt: now,
  }, needs, safeElapsedMs, now, passiveNeedMultiplier, stressDelta);
  return reconcileCareerProgression(
    applyAffectionElapsed(next, safeElapsedMs, passiveNeedMultiplier),
    now,
  );
}
