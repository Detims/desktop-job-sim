import type { CareState, NeedState, PetState } from "../shared/pet-types.js";
import { getCareItem } from "./care-items.js";

const HOUR_MS = 60 * 60 * 1_000;
export const CRITICAL_NEED_GRACE_MS = 30 * 60 * 1_000;
export const SERIOUS_ILLNESS_DURATION_MS = 5 * 60 * 1_000;
export const RECOVERY_PROTECTION_MS = 10 * 60 * 1_000;
export const COMFORT_COOLDOWN_MS = 60 * 1_000;
export const HYGIENE_DECAY_PER_HOUR = 1;
export const HEALTH_DAMAGE_PER_CRITICAL_HOUR = 12;
export const HEALTH_RECOVERY_PER_HOUR = 5;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function hygieneBand(hygiene: number): "Clean" | "Dirty" | "Messy" | "Tidy" {
  if (hygiene >= 75) return "Clean";
  if (hygiene >= 50) return "Tidy";
  if (hygiene >= 25) return "Messy";
  return "Dirty";
}

export function stressBand(stress: number): "Burned Out" | "Busy" | "Overworked" | "Relaxed" | "Stressed" {
  if (stress >= 90) return "Burned Out";
  if (stress >= 75) return "Overworked";
  if (stress >= 50) return "Stressed";
  if (stress >= 25) return "Busy";
  return "Relaxed";
}

export function isSeriouslyIll(state: PetState): boolean {
  return state.care.seriousIllness !== null;
}

export function assertSafeForMajorActivity(state: PetState): void {
  if (isSeriouslyIll(state)) {
    throw new Error("Too ill for a major activity. Care and recovery come first.");
  }
}

function nextExposure(previous: number, need: number, elapsedMs: number): number {
  return need <= 0 ? previous + elapsedMs : 0;
}

function damagingExposureDelta(previous: number, next: number): number {
  return Math.max(0, next - CRITICAL_NEED_GRACE_MS) -
    Math.max(0, previous - CRITICAL_NEED_GRACE_MS);
}

export function applyCareElapsed(
  state: PetState,
  needs: NeedState,
  elapsedMs: number,
  now: number,
  passiveMultiplier: number,
  stressDelta = 0,
): PetState {
  const safeElapsedMs = Math.max(0, elapsedMs);
  const previousCare = state.care;
  const stress = clamp(previousCare.stress + stressDelta);
  const hygiene = clamp(
    previousCare.hygiene -
      HYGIENE_DECAY_PER_HOUR * (safeElapsedMs / HOUR_MS) * passiveMultiplier,
  );
  const criticalExposureMs = {
    energy: nextExposure(previousCare.criticalExposureMs.energy, needs.energy, safeElapsedMs),
    hunger: nextExposure(previousCare.criticalExposureMs.hunger, needs.hunger, safeElapsedMs),
    thirst: nextExposure(previousCare.criticalExposureMs.thirst, needs.thirst, safeElapsedMs),
  };

  const damagingMs =
    damagingExposureDelta(previousCare.criticalExposureMs.energy, criticalExposureMs.energy) +
    damagingExposureDelta(previousCare.criticalExposureMs.hunger, criticalExposureMs.hunger) +
    damagingExposureDelta(previousCare.criticalExposureMs.thirst, criticalExposureMs.thirst);
  const hygieneMultiplier = hygiene < 25 ? 1.5 : 1;
  const stressMultiplier = stress >= 75 ? 1.25 : 1;
  const damage =
    HEALTH_DAMAGE_PER_CRITICAL_HOUR *
    (damagingMs / HOUR_MS) *
    hygieneMultiplier *
    stressMultiplier;
  const safeForRecovery =
    needs.energy >= 25 &&
    needs.hunger >= 25 &&
    needs.thirst >= 25 &&
    hygiene >= 25 &&
    stress < 75;
  const recovery =
    safeForRecovery && previousCare.seriousIllness === null
      ? HEALTH_RECOVERY_PER_HOUR * (safeElapsedMs / HOUR_MS)
      : 0;
  let health = clamp(previousCare.health - damage + recovery);
  let seriousIllness = previousCare.seriousIllness;
  let recoveryProtectedUntil = previousCare.recoveryProtectedUntil;
  let activity = state.activity;
  let presentation = state.presentation;
  let presentationUntil = state.presentationUntil;
  let statusText = state.statusText;

  if (seriousIllness !== null && now >= seriousIllness.recoverAt) {
    seriousIllness = null;
    health = Math.max(40, health);
    recoveryProtectedUntil = now + RECOVERY_PROTECTION_MS;
    presentation = "idle";
    presentationUntil = null;
    statusText = "Recovered from Serious Illness.";
  } else if (
    seriousIllness === null &&
    health < 20 &&
    now >= recoveryProtectedUntil
  ) {
    seriousIllness = {
      medicineUsed: false,
      recoverAt: now + SERIOUS_ILLNESS_DURATION_MS,
      startedAt: now,
    };
    activity = null;
    presentation = "ill";
    presentationUntil = null;
    statusText = "Seriously ill. Work and study are unavailable.";
  } else if (seriousIllness !== null) {
    activity = null;
    presentation = "ill";
    presentationUntil = null;
  } else if (previousCare.health >= 40 && health < 40) {
    statusText = "Unwell. Restore needs, cleanliness, and rest.";
  }

  const care: CareState = {
    ...previousCare,
    criticalExposureMs,
    health,
    hygiene,
    recoveryProtectedUntil,
    seriousIllness,
    stress,
  };

  return {
    ...state,
    activity,
    care,
    needs,
    presentation,
    presentationUntil,
    statusText,
    updatedAt: now,
  };
}

export function purchaseCareItem(state: PetState, itemId: string): PetState {
  const item = getCareItem(itemId);
  if (state.household.wallet < item.price) {
    throw new Error(`Not enough coins for ${item.name}.`);
  }
  return {
    ...state,
    household: {
      inventory: {
        ...state.household.inventory,
        [item.id]: (state.household.inventory[item.id] ?? 0) + 1,
      },
      wallet: state.household.wallet - item.price,
    },
    statusText: `Purchased ${item.name}.`,
  };
}

export function useCareItem(state: PetState, itemId: string, now: number): PetState {
  const item = getCareItem(itemId);
  const quantity = state.household.inventory[item.id] ?? 0;
  if (quantity < 1) throw new Error(`No ${item.name} is available.`);

  let needs = state.needs;
  let care = state.care;
  if (item.action === "feed") {
    if (needs.hunger >= 100) throw new Error("Hunger is already full.");
    needs = { ...needs, hunger: clamp(needs.hunger + item.restoreAmount) };
  } else if (item.action === "drink") {
    if (needs.thirst >= 100) throw new Error("Thirst is already full.");
    needs = { ...needs, thirst: clamp(needs.thirst + item.restoreAmount) };
  } else if (item.action === "clean") {
    if (care.hygiene >= 100) throw new Error("Hygiene is already Clean.");
    care = { ...care, hygiene: 100 };
  } else {
    const illness = care.seriousIllness;
    if (illness === null) throw new Error("Medicine is only needed during Serious Illness.");
    if (illness.medicineUsed) throw new Error("Medicine has already been used for this illness.");
    care = {
      ...care,
      seriousIllness: {
        ...illness,
        medicineUsed: true,
        recoverAt: now + Math.ceil(Math.max(0, illness.recoverAt - now) / 2),
      },
    };
  }

  const nextQuantity = quantity - 1;
  const inventory = { ...state.household.inventory };
  if (nextQuantity === 0) delete inventory[item.id];
  else inventory[item.id] = nextQuantity;
  return {
    ...state,
    care,
    household: { ...state.household, inventory },
    needs,
    statusText: `Used ${item.name}.`,
  };
}

export function comfortPet(state: PetState, now: number): PetState {
  if (now < state.care.comfortCooldownUntil) {
    throw new Error("Comfort is still on cooldown.");
  }
  return {
    ...state,
    care: {
      ...state.care,
      comfortCooldownUntil: now + COMFORT_COOLDOWN_MS,
      stress: clamp(state.care.stress - 5),
    },
    needs: { ...state.needs, mood: clamp(state.needs.mood + 5) },
    presentation: state.care.seriousIllness === null ? "petted" : "ill",
    presentationUntil: state.care.seriousIllness === null ? now + 900 : null,
    statusText: "Comforted.",
  };
}
