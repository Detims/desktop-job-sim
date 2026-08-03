import { z } from "zod";

export type {
  ActiveActivity,
  ActiveCareerJob,
  ActiveJob,
  ActiveRest,
  ActiveStudy,
  ActivityBonuses,
  ActivityType,
  CareerDefinition,
  CareerJobDefinition,
  CareerProgress,
  CareerRankDefinition,
  CareerState,
  JobDefinition,
  KnowledgeState,
  ManagementTab,
  NeedState,
  PetCommand,
  PetMutableState,
  PetPatch,
  PersistedPetRecord,
  PetSnapshot,
  PetState,
  Presentation,
  RestDefinition,
  StudyDefinition,
  WindowPoint,
} from "./pet-types.js";

export const ManagementTabSchema = z.enum(["work", "careers"]);

export const NeedStateSchema = z.object({
  energy: z.number().min(0).max(100),
  hunger: z.number().min(0).max(100),
  mood: z.number().min(0).max(100),
  thirst: z.number().min(0).max(100),
});

export const PresentationSchema = z.enum([
  "idle",
  "walking",
  "petted",
  "dragged",
  "resting",
  "studying",
  "working",
]);

export const ActiveJobSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedCoins: z.number().nonnegative(),
  creditedMastery: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  startedAt: z.number().nonnegative(),
  type: z.literal("job"),
});

export const ActiveCareerJobSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  careerId: z.string().min(1),
  creditedCareerXp: z.number().nonnegative(),
  creditedCoins: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  startedAt: z.number().nonnegative(),
  type: z.literal("careerJob"),
});

export const ActiveStudySchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedKnowledge: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  gainMultiplier: z.number().nonnegative(),
  knowledgeFieldId: z.string().min(1),
  startedAt: z.number().nonnegative(),
  type: z.literal("study"),
});

export const ActiveRestSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedEnergy: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  gainMultiplier: z.number().nonnegative(),
  startedAt: z.number().nonnegative(),
  type: z.literal("rest"),
});

export const ActiveActivitySchema = z.discriminatedUnion("type", [
  ActiveCareerJobSchema,
  ActiveJobSchema,
  ActiveRestSchema,
  ActiveStudySchema,
]);

export const KnowledgeStateSchema = z.record(
  z.string().min(1),
  z.number().nonnegative(),
);

export const CareerProgressSchema = z.object({
  careerId: z.string().min(1),
  enrolledAt: z.number().int().nonnegative(),
  mastery: z.number().nonnegative(),
  promotionReadyAt: z.number().int().nonnegative().nullable(),
  rankId: z.string().min(1),
});

export const CareerStateSchema = z.record(
  z.string().min(1),
  CareerProgressSchema,
);

const CanonicalPetStateSchema = z.object({
  activity: ActiveActivitySchema.nullable(),
  careers: CareerStateSchema,
  knowledge: KnowledgeStateSchema,
  mastery: z.number().nonnegative(),
  needs: NeedStateSchema,
  petId: z.string().min(1),
  presentation: PresentationSchema,
  presentationUntil: z.number().nonnegative().nullable(),
  randomSeed: z.number().int().nonnegative(),
  stateVersion: z.number().int().nonnegative(),
  statusText: z.string(),
  updatedAt: z.number().nonnegative(),
  wallet: z.number().nonnegative(),
});

function normalizeLegacyPetState(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  const state = input as Record<string, unknown>;
  const activity = state.activity;
  const normalizedActivity =
    typeof activity === "object" &&
    activity !== null &&
    !Array.isArray(activity) &&
    !("type" in activity)
      ? { ...activity, type: "job" }
      : activity;

  return {
    ...state,
    activity: normalizedActivity,
    careers: state.careers ?? {},
    knowledge: state.knowledge ?? { "core:general": 0 },
  };
}

export const PetStateSchema = z.preprocess(
  normalizeLegacyPetState,
  CanonicalPetStateSchema,
);

export const PetMutableStateSchema = CanonicalPetStateSchema.omit({
  petId: true,
  stateVersion: true,
}).partial();

export const PetSnapshotSchema = z.object({
  state: PetStateSchema,
});

export const PetPatchSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  changes: PetMutableStateSchema,
  nextVersion: z.number().int().nonnegative(),
});

export const PetCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cancelActivity") }),
  z.object({ careerId: z.string().min(1), type: z.literal("enrollCareer") }),
  z.object({ type: z.literal("pet") }),
  z.object({ careerId: z.string().min(1), type: z.literal("promoteCareer") }),
  z.object({ jobId: z.string().min(1), type: z.literal("startCareerJob") }),
  z.object({ type: z.literal("startJob") }),
  z.object({ type: z.literal("startRest") }),
  z.object({ type: z.literal("startStudy") }),
  z.object({ type: z.literal("walk") }),
]);

export const WindowPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const PersistedPetRecordSchema = z.object({
  cleanExit: z.boolean(),
  position: WindowPointSchema,
  savedAt: z.number().nonnegative(),
  state: PetStateSchema,
});

export const JobDefinitionSchema = z.object({
  completionMasteryBonus: z.number().nonnegative(),
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  rewardCoins: z.number().nonnegative(),
  rewardMastery: z.number().nonnegative(),
});

export const CareerRankDefinitionSchema = z.object({
  advancement: z.enum(["automatic", "enrollment", "promotion"]),
  id: z.string().min(1),
  name: z.string().min(1),
  requiredKnowledge: z.number().nonnegative(),
  requiredMastery: z.number().nonnegative(),
});

export const CareerDefinitionSchema = z.object({
  enrollmentKnowledge: z.object({
    fieldId: z.string().min(1),
    minimum: z.number().nonnegative(),
  }),
  id: z.string().min(1),
  name: z.string().min(1),
  ranks: z.array(CareerRankDefinitionSchema).min(1),
});

export const CareerJobDefinitionSchema = z.object({
  careerId: z.string().min(1),
  completionCareerXpBonus: z.number().nonnegative(),
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  requiredRankId: z.string().min(1),
  rewardCareerXp: z.number().nonnegative(),
  rewardCoins: z.number().nonnegative(),
});

export const StudyDefinitionSchema = z.object({
  durationMs: z.number().positive(),
  id: z.string().min(1),
  knowledgeFieldId: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  rewardKnowledge: z.number().nonnegative(),
});

export const RestDefinitionSchema = z.object({
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  recoveryEnergy: z.number().positive(),
});
