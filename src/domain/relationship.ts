import type { PetState, RelationshipState } from "../shared/pet-types.js";

const HOUR_MS = 60 * 60 * 1_000;
export const AFFECTION_DECAY_PER_HOUR = 1;
export const DAILY_BOND_CAP = 5;
export const GROWING_CLOSER_BOND = 10;
export const PET_COOLDOWN_MS = 15 * 1_000;
export const TALK_COOLDOWN_MS = 60 * 1_000;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function localDateKey(now: number): string {
  const date = new Date(now);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentBondBudget(
  relationship: RelationshipState,
  now: number,
): Pick<RelationshipState, "bondAwardDate" | "bondAwardedToday"> {
  const today = localDateKey(now);
  if (relationship.bondAwardDate === "" || today > relationship.bondAwardDate) {
    return { bondAwardDate: today, bondAwardedToday: 0 };
  }
  return {
    bondAwardDate: relationship.bondAwardDate,
    bondAwardedToday: relationship.bondAwardedToday,
  };
}

export function applyRelationshipGain(
  state: PetState,
  now: number,
  affectionGain: number,
  bondGain: number,
): PetState {
  const budget = currentBondBudget(state.relationship, now);
  const awardedBond = Math.min(
    Math.max(0, bondGain),
    Math.max(0, DAILY_BOND_CAP - budget.bondAwardedToday),
    Math.max(0, 100 - state.relationship.bond),
  );
  const bond = clamp(state.relationship.bond + awardedBond);
  return {
    ...state,
    relationship: {
      ...state.relationship,
      affection: clamp(state.relationship.affection + Math.max(0, affectionGain)),
      bond,
      bondAwardDate: budget.bondAwardDate,
      bondAwardedToday: budget.bondAwardedToday + awardedBond,
      growingCloserRecorded:
        state.relationship.growingCloserRecorded || bond >= GROWING_CLOSER_BOND,
    },
  };
}

export function applyAffectionElapsed(
  state: PetState,
  elapsedMs: number,
  rate = 1,
): PetState {
  const affection = clamp(
    state.relationship.affection -
      AFFECTION_DECAY_PER_HOUR *
        (Math.max(0, elapsedMs) / HOUR_MS) *
        Math.max(0, rate),
  );
  return {
    ...state,
    relationship: { ...state.relationship, affection },
  };
}

export function petRelationship(state: PetState, now: number): PetState {
  if (now < state.relationship.petCooldownUntil) {
    throw new Error("Petting is still on cooldown.");
  }
  const next = applyRelationshipGain(state, now, 1, 0.1);
  return {
    ...next,
    relationship: {
      ...next.relationship,
      petCooldownUntil: now + PET_COOLDOWN_MS,
    },
  };
}

const TALK_RESPONSES = [
  "A bright chirp answers you.",
  "Your pet leans closer to listen.",
  "A tiny, content reply follows.",
] as const;

export function talkToPet(state: PetState, now: number): PetState {
  if (now < state.relationship.talkCooldownUntil) {
    throw new Error("Talk is still on cooldown.");
  }
  const next = applyRelationshipGain(state, now, 3, 0.3);
  const response = TALK_RESPONSES[Math.floor(now / TALK_COOLDOWN_MS) % TALK_RESPONSES.length]!;
  return {
    ...next,
    relationship: {
      ...next.relationship,
      talkCooldownUntil: now + TALK_COOLDOWN_MS,
    },
    statusText: response,
  };
}
