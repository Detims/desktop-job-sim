import rawPrototypeJob from "../../content/core/jobs/prototype-job.json" with {
  type: "json",
};
import {
  JobDefinitionSchema,
  type JobDefinition,
  type NeedState,
  type PetState,
} from "../shared/contracts.js";

export const PROTOTYPE_JOB = JobDefinitionSchema.parse(rawPrototypeJob);

export const NEED_DECAY_PER_HOUR: Readonly<NeedState> = Object.freeze({
  energy: 1.5,
  hunger: 2,
  mood: 1,
  thirst: 2.5,
});

const HOUR_MS = 60 * 60 * 1000;
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

export function createInitialPetState(now: number): PetState {
  return {
    activity: null,
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
  if (state.activity !== null) {
    return state;
  }

  if (state.needs.energy < 10) {
    return {
      ...state,
      statusText: "Too tired to work.",
    };
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
    },
    presentation: "working",
    presentationUntil: null,
    statusText: `Working: ${definition.name}`,
  };
}

export function cancelActiveJob(state: PetState): PetState {
  if (state.activity === null) {
    return state;
  }

  return {
    ...state,
    activity: null,
    presentation: "idle",
    presentationUntil: null,
    statusText: "Work cancelled. Partial rewards kept.",
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
    presentation: state.activity === null ? "idle" : "working",
    presentationUntil: null,
    updatedAt: now,
  };
}

export function advancePetState(
  state: PetState,
  elapsedMs: number,
  now: number,
  definition: JobDefinition = PROTOTYPE_JOB,
): PetState {
  const safeElapsedMs = Math.max(0, elapsedMs);
  let needs = applyNeedDelta(
    state.needs,
    NEED_DECAY_PER_HOUR,
    safeElapsedMs / HOUR_MS,
  );
  let activity = state.activity;
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
    presentation = activity === null ? "idle" : "working";
    presentationUntil = null;
  }

  if (activity !== null) {
    const remainingMs = Math.max(
      0,
      activity.durationMs - activity.accumulatedMs,
    );
    const activeElapsedMs = Math.min(safeElapsedMs, remainingMs);
    const nextAccumulatedMs = activity.accumulatedMs + activeElapsedMs;
    const progress = nextAccumulatedMs / activity.durationMs;
    const targetCoins = definition.rewardCoins * progress;
    const targetMastery = definition.rewardMastery * progress;

    needs = applyNeedDelta(
      needs,
      definition.needCosts,
      activeElapsedMs / activity.durationMs,
    );
    wallet += targetCoins - activity.creditedCoins;
    mastery += targetMastery - activity.creditedMastery;

    if (nextAccumulatedMs >= activity.durationMs) {
      mastery += definition.completionMasteryBonus;
      activity = null;
      presentation = "idle";
      presentationUntil = null;
      statusText = `Completed ${definition.name}!`;
    } else {
      activity = {
        ...activity,
        accumulatedMs: nextAccumulatedMs,
        creditedCoins: targetCoins,
        creditedMastery: targetMastery,
      };

      if (presentation !== "petted") {
        presentation = "working";
      }
    }
  }

  return {
    ...state,
    activity,
    mastery,
    needs,
    presentation,
    presentationUntil,
    statusText,
    updatedAt: now,
    wallet,
  };
}
