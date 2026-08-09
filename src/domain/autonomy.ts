import type {
  CareItemAction,
  CareItemDefinition,
  JobDefinition,
  PetState,
} from "../shared/pet-types.js";
import type { AutonomyMode } from "../shared/settings-activity-types.js";
import { isBurnedOut } from "./burnout.js";
import { CARE_ITEMS } from "./care-items.js";
import { personalLevel } from "./personal-growth.js";

export const AUTONOMY_THRESHOLDS = Object.freeze({
  energy: 20,
  hunger: 25,
  hygiene: 25,
  thirst: 25,
  unsafeHealth: 40,
  unsafeNeed: 10,
});

export interface AutonomyPolicy {
  mode: AutonomyMode;
  reserveCoins: number;
}

export type AutonomyNeed = "energy" | "health" | "hunger" | "hygiene" | "thirst";

export type AutonomyDecision =
  | { reason: string; trigger: AutonomyNeed; type: "cancelActivity" }
  | { itemId: string; trigger: AutonomyNeed; type: "useItem" }
  | { emergency: boolean; itemId: string; trigger: AutonomyNeed; type: "purchaseItem" }
  | { trigger: "energy"; type: "startRest" }
  | { jobId: string; trigger: AutonomyNeed; type: "startJob" }
  | { code: string; message: string; trigger: AutonomyNeed; type: "blocked" };

const ACTION_FOR_NEED: Readonly<Record<Exclude<AutonomyNeed, "energy" | "health">, CareItemAction>> = {
  hunger: "feed",
  hygiene: "clean",
  thirst: "drink",
};

function eligibleEssentials(
  state: PetState,
  action: CareItemAction,
): readonly CareItemDefinition[] {
  const level = personalLevel(state.generalXp);
  return CARE_ITEMS
    .filter((item) =>
      item.category === "essential" &&
      item.action === action &&
      item.requiredLevel <= level &&
      item.requiredBond <= state.relationship.bond,
    )
    .toSorted((left, right) => left.price - right.price || left.id.localeCompare(right.id));
}

function ownedEssential(
  state: PetState,
  action: CareItemAction,
): CareItemDefinition | undefined {
  return eligibleEssentials(state, action)
    .find((item) => (state.household.inventory[item.id] ?? 0) > 0);
}

function mayPurchase(mode: AutonomyMode): boolean {
  return mode === "carefulSpending" || mode === "independent";
}

function canSafelyCompleteJob(state: PetState, job: JobDefinition): boolean {
  return state.activity === null &&
    state.care.seriousIllness === null &&
    state.care.health >= AUTONOMY_THRESHOLDS.unsafeHealth &&
    !isBurnedOut(state) &&
    state.needs.energy - job.needCosts.energy > AUTONOMY_THRESHOLDS.unsafeNeed &&
    state.needs.hunger - job.needCosts.hunger > AUTONOMY_THRESHOLDS.unsafeNeed &&
    state.needs.thirst - job.needCosts.thirst > AUTONOMY_THRESHOLDS.unsafeNeed;
}

function unsafeActivityTrigger(state: PetState): { reason: string; trigger: AutonomyNeed } | null {
  if (state.care.seriousIllness !== null) {
    return { reason: "Serious Illness makes the activity unsafe.", trigger: "health" };
  }
  if (state.care.health < AUTONOMY_THRESHOLDS.unsafeHealth) {
    return { reason: "Health fell below 40.", trigger: "health" };
  }
  if (isBurnedOut(state)) {
    return { reason: "Burnout makes the activity unsafe.", trigger: "health" };
  }
  for (const need of ["thirst", "hunger", "energy"] as const) {
    if (state.needs[need] <= AUTONOMY_THRESHOLDS.unsafeNeed) {
      return { reason: `${need} reached the unsafe threshold.`, trigger: need };
    }
  }
  return null;
}

function itemDecision(
  state: PetState,
  policy: AutonomyPolicy,
  trigger: Exclude<AutonomyNeed, "energy" | "health">,
  value: number,
  subsistenceJob: JobDefinition,
): AutonomyDecision | null {
  const action = ACTION_FOR_NEED[trigger];
  const owned = ownedEssential(state, action);
  if (owned !== undefined) return { itemId: owned.id, trigger, type: "useItem" };

  const cheapest = eligibleEssentials(state, action)[0];
  if (!mayPurchase(policy.mode)) {
    return {
      code: "autonomy.essential_not_owned",
      message: `Autonomy needs ${cheapest?.name ?? trigger}, but none is owned.`,
      trigger,
      type: "blocked",
    };
  }
  if (cheapest === undefined) {
    return {
      code: "autonomy.essential_unavailable",
      message: `No eligible essential can restore ${trigger}.`,
      trigger,
      type: "blocked",
    };
  }

  const emergency = value <= AUTONOMY_THRESHOLDS.unsafeNeed;
  const canAfford = state.household.wallet >= cheapest.price;
  const preservesReserve = state.household.wallet - cheapest.price >= policy.reserveCoins;
  if (canAfford && (preservesReserve || emergency)) {
    return { emergency, itemId: cheapest.id, trigger, type: "purchaseItem" };
  }

  if (
    policy.mode === "independent" &&
    canSafelyCompleteJob(state, subsistenceJob)
  ) {
    return { jobId: subsistenceJob.id, trigger, type: "startJob" };
  }

  if (!emergency && canAfford) return null;
  return {
    code: "autonomy.no_safe_action",
    message: `No safe autonomous action can restore ${trigger} right now.`,
    trigger,
    type: "blocked",
  };
}

function medicineDecision(
  state: PetState,
  policy: AutonomyPolicy,
): AutonomyDecision | null {
  const illness = state.care.seriousIllness;
  if (illness === null || illness.medicineUsed) return null;
  const owned = ownedEssential(state, "medicine");
  if (owned !== undefined) return { itemId: owned.id, trigger: "health", type: "useItem" };
  const medicine = eligibleEssentials(state, "medicine")[0];
  if (mayPurchase(policy.mode) && medicine !== undefined && state.household.wallet >= medicine.price) {
    return { emergency: true, itemId: medicine.id, trigger: "health", type: "purchaseItem" };
  }
  return {
    code: "autonomy.medicine_unavailable",
    message: "Serious Illness needs Medicine, but it cannot be acquired safely.",
    trigger: "health",
    type: "blocked",
  };
}

export function evaluateAutonomy(
  state: PetState,
  policy: AutonomyPolicy,
  subsistenceJob: JobDefinition,
): AutonomyDecision | null {
  if (policy.mode === "manual") return null;

  if (
    state.activity !== null &&
    state.activity.type !== "rest"
  ) {
    const unsafe = unsafeActivityTrigger(state);
    if (unsafe !== null) return { ...unsafe, type: "cancelActivity" };
  }

  const unresolvedMedicine = medicineDecision(state, policy);
  if (unresolvedMedicine !== null && unresolvedMedicine.type !== "blocked") {
    return unresolvedMedicine;
  }

  if (state.needs.thirst <= AUTONOMY_THRESHOLDS.thirst) {
    const decision = itemDecision(state, policy, "thirst", state.needs.thirst, subsistenceJob);
    if (decision !== null) return decision;
  }
  if (state.needs.hunger <= AUTONOMY_THRESHOLDS.hunger) {
    const decision = itemDecision(state, policy, "hunger", state.needs.hunger, subsistenceJob);
    if (decision !== null) return decision;
  }
  if (state.needs.energy <= AUTONOMY_THRESHOLDS.energy && state.activity === null) {
    if (state.care.seriousIllness === null) return { trigger: "energy", type: "startRest" };
  }
  if (state.care.hygiene < AUTONOMY_THRESHOLDS.hygiene) {
    const decision = itemDecision(state, policy, "hygiene", state.care.hygiene, subsistenceJob);
    if (decision !== null) return decision;
  }

  return unresolvedMedicine;
}
