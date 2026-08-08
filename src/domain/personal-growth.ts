import rawLevels from "../../content/core/progression/personal-levels.json" with { type: "json" };
import {
  PersonalLevelDefinitionSchema,
  type PersonalLevelDefinition,
  type PetState,
} from "../shared/contracts.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";
import type { MemoryEntryDraft } from "../shared/memory-types.js";

export const PERSONAL_LEVELS: readonly PersonalLevelDefinition[] = Object.freeze(
  rawLevels.map((definition) => PersonalLevelDefinitionSchema.parse(definition)),
);

function validateLevels(): void {
  if (PERSONAL_LEVELS[0]?.level !== 1 || PERSONAL_LEVELS[0]?.requiredXp !== 0) {
    throw new Error("Personal Growth must begin at Level 1 with zero XP.");
  }
  for (let index = 1; index < PERSONAL_LEVELS.length; index += 1) {
    const previous = PERSONAL_LEVELS[index - 1]!;
    const current = PERSONAL_LEVELS[index]!;
    if (
      current.level !== previous.level + 1 ||
      current.requiredXp <= previous.requiredXp
    ) {
      throw new Error("Personal Growth levels must increase consecutively.");
    }
  }
}
validateLevels();

export const MAX_PROOF_LEVEL = PERSONAL_LEVELS.at(-1)!.level;
export const INTENTIONAL_ACTION_XP = 1;
export const MEDICINE_ACTION_XP = 2;

export function personalLevel(generalXp: number): number {
  const safeXp = Math.max(0, generalXp);
  return PERSONAL_LEVELS.reduce(
    (level, definition) =>
      safeXp >= definition.requiredXp ? definition.level : level,
    1,
  );
}

export function nextPersonalLevel(generalXp: number): PersonalLevelDefinition | null {
  const current = personalLevel(generalXp);
  return PERSONAL_LEVELS.find((definition) => definition.level > current) ?? null;
}

export function hasRequiredLevel(state: PetState, requiredLevel: number): boolean {
  return personalLevel(state.generalXp) >= requiredLevel;
}

export function assertRequiredLevel(
  state: PetState,
  requiredLevel: number,
  contentName: string,
): void {
  if (!hasRequiredLevel(state, requiredLevel)) {
    throw new Error(`${contentName} requires Level ${requiredLevel}.`);
  }
}

export function grantGeneralXp(state: PetState, amount: number): PetState {
  const safeAmount = Math.max(0, amount);
  return safeAmount === 0
    ? state
    : { ...state, generalXp: state.generalXp + safeAmount };
}

export function crossedPersonalLevels(
  previousXp: number,
  nextXp: number,
): readonly PersonalLevelDefinition[] {
  return PERSONAL_LEVELS.filter(
    (definition) =>
      definition.level > 1 &&
      previousXp < definition.requiredXp &&
      nextXp >= definition.requiredXp,
  );
}

export function personalGrowthEventDrafts(
  prior: PetState,
  next: PetState,
): MeaningfulEventDraft[] {
  return crossedPersonalLevels(prior.generalXp, next.generalXp).map(
    (definition) => ({
      details: {
        generalXp: next.generalXp,
        level: definition.level,
        requiredXp: definition.requiredXp,
      },
      petId: next.petId,
      summary: `Reached Personal Level ${definition.level}.`,
      type: "progression.level_up",
    }),
  );
}

export function personalGrowthMemoryDrafts(
  prior: PetState,
  next: PetState,
): MemoryEntryDraft[] {
  return crossedPersonalLevels(prior.generalXp, next.generalXp).some(
    (definition) => definition.level === 2,
  )
    ? [{
        category: "personal-growth",
        description: "Grew through care, study, work, rest, play, and time together.",
        petId: next.petId,
        title: "Growing Up",
      }]
    : [];
}
