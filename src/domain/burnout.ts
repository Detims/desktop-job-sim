import rawBurnout from "../../content/core/conditions/burnout.json" with { type: "json" };
import type { PetState } from "../shared/pet-types.js";

export const BURNOUT_CONDITION_ID = "core:burnout";
export const BURNOUT_EXPOSURE_THRESHOLD_MS = 60_000;
export const BURNOUT_PROTECTION_MS = 5 * 60_000;
export const BURNOUT_RECOVERY_PER_CYCLE_MS = 2 * 60_000;
export const BURNOUT_STRESS_THRESHOLD = 75;
export const BURNOUT_EXPOSURE_RESET_STRESS = 50;
export const BURNOUT_IMMEDIATE_STRESS = 90;
export const BURNOUT_IMMEDIATE_NEED = 20;

export const BURNOUT_DEFINITION = Object.freeze({
  durationMs: rawBurnout.durationMs,
  id: rawBurnout.id,
  name: rawBurnout.name,
  positiveMoodMultiplier: rawBurnout.positiveMoodMultiplier,
  restEnergyMultiplier: rawBurnout.restEnergyMultiplier,
  studyGainMultiplier: rawBurnout.studyGainMultiplier,
});

export function isBurnedOut(state: PetState): boolean {
  return state.conditions[BURNOUT_CONDITION_ID] !== undefined;
}

export function assertNotBurnedOutForDemandingActivity(
  state: PetState,
  demanding: boolean,
): void {
  if (demanding && isBurnedOut(state)) {
    throw new Error("Burnout blocks demanding work and study. Rest or play to recover.");
  }
}

export function assertNotBurnedOutForExam(state: PetState): void {
  if (isBurnedOut(state)) {
    throw new Error("Burnout blocks exams. Rest or play to recover.");
  }
}

export function positiveMoodGain(state: PetState, gain: number): number {
  return gain > 0 && isBurnedOut(state)
    ? gain * BURNOUT_DEFINITION.positiveMoodMultiplier
    : gain;
}

export function reconcileBurnoutState(state: PetState, now: number): PetState {
  const burnout = state.conditions[BURNOUT_CONDITION_ID];
  if (burnout === undefined || burnout.expiresAt > now) return state;
  const conditions = { ...state.conditions };
  delete conditions[BURNOUT_CONDITION_ID];
  return {
    ...state,
    care: {
      ...state.care,
      burnoutProtectedUntil: now + BURNOUT_PROTECTION_MS,
      overworkExposureMs: 0,
    },
    conditions,
    statusText: "Recovered from Burnout.",
  };
}

export function shortenBurnoutRecovery(
  state: PetState,
  activeElapsedMs: number,
  activityDurationMs: number,
  now: number,
): PetState {
  const burnout = state.conditions[BURNOUT_CONDITION_ID];
  if (burnout === undefined || activeElapsedMs <= 0) return state;
  const shortenedBy =
    BURNOUT_RECOVERY_PER_CYCLE_MS * (activeElapsedMs / activityDurationMs);
  const expiresAt = Math.max(now, burnout.expiresAt - shortenedBy);
  return reconcileBurnoutState({
    ...state,
    conditions: {
      ...state.conditions,
      [BURNOUT_CONDITION_ID]: { ...burnout, expiresAt },
    },
  }, now);
}

export function applyBurnoutExposure(
  state: PetState,
  elapsedMs: number,
  now: number,
  exposureMode: "recovery" | "work" | "none",
): PetState {
  let stateAfterExpiry = reconcileBurnoutState(state, now);
  const protectedFromRecurrence = now < stateAfterExpiry.care.burnoutProtectedUntil;
  const stress = stateAfterExpiry.care.stress;
  let exposure = stateAfterExpiry.care.overworkExposureMs;
  if (stress < BURNOUT_EXPOSURE_RESET_STRESS) {
    exposure = 0;
  } else if (exposureMode === "recovery") {
    exposure = Math.max(0, exposure - Math.max(0, elapsedMs) * 2);
  } else if (
    exposureMode === "work" &&
    !isBurnedOut(stateAfterExpiry) &&
    stress >= BURNOUT_STRESS_THRESHOLD
  ) {
    exposure += Math.max(0, elapsedMs);
  }

  if (isBurnedOut(stateAfterExpiry)) {
    return exposure === stateAfterExpiry.care.overworkExposureMs
      ? stateAfterExpiry
      : {
          ...stateAfterExpiry,
          care: { ...stateAfterExpiry.care, overworkExposureMs: exposure },
        };
  }

  const immediate =
    stress >= BURNOUT_IMMEDIATE_STRESS &&
    (stateAfterExpiry.needs.energy <= BURNOUT_IMMEDIATE_NEED ||
      stateAfterExpiry.needs.mood <= BURNOUT_IMMEDIATE_NEED);
  const shouldStart =
    !protectedFromRecurrence &&
    (immediate || exposure >= BURNOUT_EXPOSURE_THRESHOLD_MS);

  if (!shouldStart) {
    if (exposure === stateAfterExpiry.care.overworkExposureMs) return stateAfterExpiry;
    return {
      ...stateAfterExpiry,
      care: { ...stateAfterExpiry.care, overworkExposureMs: exposure },
    };
  }

  return {
    ...stateAfterExpiry,
    care: { ...stateAfterExpiry.care, overworkExposureMs: exposure },
    conditions: {
      ...stateAfterExpiry.conditions,
      [BURNOUT_CONDITION_ID]: {
        conditionId: BURNOUT_CONDITION_ID,
        expiresAt: now + BURNOUT_DEFINITION.durationMs,
      },
    },
    statusText: "Burnout began. Demanding work, study, and exams are unavailable.",
  };
}
