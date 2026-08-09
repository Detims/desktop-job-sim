import { z } from "zod";

export type {
  ActiveActivity,
  ActiveCareerJob,
  ActiveJob,
  ActivePlay,
  ActiveRest,
  ActiveStudy,
  ActivityBonuses,
  ActivityType,
  CareerDefinition,
  CareerJobDefinition,
  CareerProgress,
  CareerRankDefinition,
  CareerState,
  CareItemAction,
  CareItemDefinition,
  CareState,
  ConditionProgress,
  ConditionState,
  ExamCooldownState,
  ExamDefinition,
  HouseholdState,
  InventoryState,
  JobDefinition,
  KnowledgeState,
  ManagementTab,
  CommerceTab,
  NeedState,
  PetCommand,
  PetMutableState,
  PetPatch,
  PersistedPetRecord,
  PetSnapshot,
  PetState,
  PersonalLevelDefinition,
  PlayDefinition,
  Presentation,
  QualificationProgress,
  QualificationState,
  RelationshipState,
  RestDefinition,
  StudyDefinition,
  WindowPoint,
} from "./pet-types.js";

export const ManagementTabSchema = z.enum(["work", "careers", "memories"]);
export const CommerceTabSchema = z.enum([
  "shop",
  "inventory",
]);

export const NeedStateSchema = z.object({
  energy: z.number().min(0).max(100),
  hunger: z.number().min(0).max(100),
  mood: z.number().min(0).max(100),
  thirst: z.number().min(0).max(100),
});

export const InventoryStateSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export const HouseholdStateSchema = z.object({
  inventory: InventoryStateSchema,
  wallet: z.number().nonnegative(),
});

export const CareStateSchema = z.object({
  burnoutProtectedUntil: z.number().int().nonnegative(),
  comfortCooldownUntil: z.number().int().nonnegative(),
  criticalExposureMs: z.object({
    energy: z.number().nonnegative(),
    hunger: z.number().nonnegative(),
    thirst: z.number().nonnegative(),
  }),
  health: z.number().min(0).max(100),
  hygiene: z.number().min(0).max(100),
  overworkExposureMs: z.number().nonnegative(),
  recoveryProtectedUntil: z.number().int().nonnegative(),
  seriousIllness: z.object({
    medicineUsed: z.boolean(),
    recoverAt: z.number().int().nonnegative(),
    startedAt: z.number().int().nonnegative(),
  }).nullable(),
  stress: z.number().min(0).max(100),
});

export const RelationshipStateSchema = z.object({
  affection: z.number().min(0).max(100),
  bond: z.number().min(0).max(100),
  bondAwardDate: z.string(),
  bondAwardedToday: z.number().min(0).max(5),
  growingCloserRecorded: z.boolean(),
  petCooldownUntil: z.number().int().nonnegative(),
  talkCooldownUntil: z.number().int().nonnegative(),
});

export const PresentationSchema = z.enum([
  "idle",
  "walking",
  "petted",
  "playing",
  "dragged",
  "resting",
  "studying",
  "working",
  "ill",
]);

export const ActiveJobSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedGeneralXp: z.number().nonnegative(),
  creditedCoins: z.number().nonnegative(),
  creditedMastery: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  startedAt: z.number().nonnegative(),
  type: z.literal("job"),
});

export const ActiveCareerJobSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedGeneralXp: z.number().nonnegative(),
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
  creditedGeneralXp: z.number().nonnegative(),
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
  creditedGeneralXp: z.number().nonnegative(),
  creditedEnergy: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  gainMultiplier: z.number().nonnegative(),
  startedAt: z.number().nonnegative(),
  type: z.literal("rest"),
});

export const ActivePlaySchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedGeneralXp: z.number().nonnegative(),
  creditedAffection: z.number().nonnegative(),
  creditedBond: z.number().nonnegative(),
  creditedEnergyCost: z.number().nonnegative(),
  creditedMood: z.number().nonnegative(),
  creditedStressRecovery: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  startedAt: z.number().nonnegative(),
  type: z.literal("play"),
});

export const ActiveActivitySchema = z.discriminatedUnion("type", [
  ActiveCareerJobSchema,
  ActiveJobSchema,
  ActivePlaySchema,
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

export const ConditionProgressSchema = z.object({
  conditionId: z.string().min(1),
  expiresAt: z.number().int().nonnegative(),
});
export const ConditionStateSchema = z.record(
  z.string().min(1),
  ConditionProgressSchema,
);
export const ExamCooldownStateSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);
export const QualificationProgressSchema = z.object({
  earnedAt: z.number().int().nonnegative(),
  qualificationId: z.string().min(1),
});
export const QualificationStateSchema = z.record(
  z.string().min(1),
  QualificationProgressSchema,
);

const CanonicalPetStateSchema = z.object({
  activity: ActiveActivitySchema.nullable(),
  care: CareStateSchema,
  careers: CareerStateSchema,
  conditions: ConditionStateSchema,
  examCooldowns: ExamCooldownStateSchema,
  generalXp: z.number().nonnegative(),
  household: HouseholdStateSchema,
  knowledge: KnowledgeStateSchema,
  mastery: z.number().nonnegative(),
  needs: NeedStateSchema,
  petId: z.string().min(1),
  presentation: PresentationSchema,
  presentationUntil: z.number().nonnegative().nullable(),
  randomSeed: z.number().int().nonnegative(),
  qualifications: QualificationStateSchema,
  relationship: RelationshipStateSchema,
  stateVersion: z.number().int().nonnegative(),
  statusText: z.string(),
  updatedAt: z.number().nonnegative(),
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
      ? { creditedGeneralXp: 0, ...activity, type: "job" }
      : typeof activity === "object" &&
          activity !== null &&
          !Array.isArray(activity)
        ? { creditedGeneralXp: 0, ...activity }
        : activity;

  return {
    ...state,
    activity: normalizedActivity,
    care: {
      burnoutProtectedUntil: 0,
      comfortCooldownUntil: 0,
      criticalExposureMs: { energy: 0, hunger: 0, thirst: 0 },
      health: 100,
      hygiene: 100,
      overworkExposureMs: 0,
      recoveryProtectedUntil: 0,
      seriousIllness: null,
      stress: 0,
      ...(typeof state.care === "object" && state.care !== null
        ? state.care
        : {}),
    },
    careers: state.careers ?? {},
    conditions: state.conditions ?? {},
    examCooldowns: state.examCooldowns ?? {},
    generalXp: state.generalXp ?? 0,
    household: state.household ?? {
      inventory: {},
      wallet: typeof state.wallet === "number" ? state.wallet : 0,
    },
    knowledge: state.knowledge ?? { "core:general": 0 },
    qualifications: state.qualifications ?? {},
    relationship: state.relationship ?? {
      affection: 50,
      bond: 0,
      bondAwardDate: "",
      bondAwardedToday: 0,
      growingCloserRecorded: false,
      petCooldownUntil: 0,
      talkCooldownUntil: 0,
    },
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
  z.object({ type: z.literal("comfort") }),
  z.object({ careerId: z.string().min(1), type: z.literal("enrollCareer") }),
  z.object({ examId: z.string().min(1), type: z.literal("attemptExam") }),
  z.object({ type: z.literal("pet") }),
  z.object({ itemId: z.string().min(1), type: z.literal("purchaseItem") }),
  z.object({ careerId: z.string().min(1), type: z.literal("promoteCareer") }),
  z.object({ jobId: z.string().min(1), type: z.literal("startCareerJob") }),
  z.object({ jobId: z.string().min(1).optional(), type: z.literal("startJob") }),
  z.object({ type: z.literal("startPlay") }),
  z.object({ type: z.literal("startRest") }),
  z.object({ studyId: z.string().min(1).optional(), type: z.literal("startStudy") }),
  z.object({ type: z.literal("talk") }),
  z.object({ itemId: z.string().min(1), type: z.literal("useItem") }),
  z.object({ type: z.literal("walk") }),
]);

export const CareItemDefinitionSchema = z.object({
  action: z.enum(["clean", "drink", "feed", "gift", "medicine"]),
  generalXpReward: z.number().nonnegative(),
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  relationshipAffection: z.number().min(0).max(100).default(0),
  relationshipBond: z.number().min(0).max(100).default(0),
  requiredBond: z.number().min(0).max(100).default(0),
  requiredLevel: z.number().int().positive(),
  restoreAmount: z.number().min(0).max(100),
});

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
  demanding: z.boolean(),
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  requiredLevel: z.number().int().positive(),
  rewardCoins: z.number().nonnegative(),
  rewardGeneralXp: z.number().nonnegative(),
  rewardMastery: z.number().nonnegative(),
  stressCost: z.number().nonnegative(),
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
  enrollmentQualificationId: z.string().min(1).optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  ranks: z.array(CareerRankDefinitionSchema).min(1),
});

export const CareerJobDefinitionSchema = z.object({
  careerId: z.string().min(1),
  completionCareerXpBonus: z.number().nonnegative(),
  demanding: z.boolean(),
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  requiredRankId: z.string().min(1),
  rewardCareerXp: z.number().nonnegative(),
  rewardCoins: z.number().nonnegative(),
  rewardGeneralXp: z.number().nonnegative(),
  stressCost: z.number().nonnegative(),
});

export const StudyDefinitionSchema = z.object({
  demanding: z.boolean(),
  durationMs: z.number().positive(),
  id: z.string().min(1),
  knowledgeFieldId: z.string().min(1),
  name: z.string().min(1),
  needCosts: NeedStateSchema,
  rewardKnowledge: z.number().nonnegative(),
  rewardGeneralXp: z.number().nonnegative(),
  stressCost: z.number().nonnegative(),
});

export const ExamDefinitionSchema = z.object({
  coinCost: z.number().nonnegative(),
  condition: z.object({
    durationMs: z.number().positive(),
    id: z.string().min(1),
    name: z.string().min(1),
    studyMultiplier: z.number().positive().max(1),
  }),
  cooldownMs: z.number().positive(),
  energyCost: z.number().nonnegative(),
  failureMoodCost: z.number().nonnegative(),
  guaranteedKnowledge: z.number().nonnegative(),
  id: z.string().min(1),
  knowledgeFieldId: z.string().min(1),
  minimumEnergy: z.number().min(0).max(100),
  minimumMood: z.number().min(0).max(100),
  name: z.string().min(1),
  qualificationId: z.string().min(1),
  riskChanceMaximum: z.number().min(0).max(1),
  riskChanceMinimum: z.number().min(0).max(1),
  riskMinimumKnowledge: z.number().nonnegative(),
  unlockCareerId: z.string().min(1),
}).refine(
  (definition) =>
    definition.guaranteedKnowledge > definition.riskMinimumKnowledge &&
    definition.riskChanceMaximum >= definition.riskChanceMinimum,
  { message: "Exam thresholds and risk chances must increase." },
);

export const RestDefinitionSchema = z.object({
  durationMs: z.number().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  recoveryEnergy: z.number().positive(),
  rewardGeneralXp: z.number().nonnegative(),
  stressRecovery: z.number().nonnegative(),
});

export const PlayDefinitionSchema = z.object({
  affectionGain: z.number().nonnegative(),
  bondGain: z.number().nonnegative(),
  durationMs: z.number().positive(),
  energyCost: z.number().nonnegative(),
  id: z.string().min(1),
  moodGain: z.number().nonnegative(),
  name: z.string().min(1),
  rewardGeneralXp: z.number().nonnegative(),
  stressRecovery: z.number().nonnegative(),
});

export const PersonalLevelDefinitionSchema = z.object({
  level: z.number().int().positive(),
  requiredXp: z.number().nonnegative(),
});
