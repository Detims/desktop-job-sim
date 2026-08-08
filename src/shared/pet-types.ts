export interface NeedState {
  energy: number;
  hunger: number;
  mood: number;
  thirst: number;
}

export type InventoryState = Readonly<Record<string, number>>;

export interface HouseholdState {
  inventory: InventoryState;
  wallet: number;
}

export interface CriticalExposureState {
  energy: number;
  hunger: number;
  thirst: number;
}

export interface SeriousIllnessState {
  medicineUsed: boolean;
  recoverAt: number;
  startedAt: number;
}

export interface CareState {
  burnoutProtectedUntil: number;
  comfortCooldownUntil: number;
  criticalExposureMs: CriticalExposureState;
  health: number;
  hygiene: number;
  overworkExposureMs: number;
  recoveryProtectedUntil: number;
  seriousIllness: SeriousIllnessState | null;
  stress: number;
}

export interface RelationshipState {
  affection: number;
  bond: number;
  bondAwardDate: string;
  bondAwardedToday: number;
  growingCloserRecorded: boolean;
  petCooldownUntil: number;
  talkCooldownUntil: number;
}

export type CareItemAction = "clean" | "drink" | "feed" | "gift" | "medicine";

export interface CareItemDefinition {
  action: CareItemAction;
  generalXpReward: number;
  id: string;
  name: string;
  price: number;
  relationshipAffection: number;
  relationshipBond: number;
  requiredBond: number;
  requiredLevel: number;
  restoreAmount: number;
}

export type ActivityType = "careerJob" | "job" | "play" | "rest" | "study";

export interface ActivityBonuses {
  restRecovery: number;
  studyGain: number;
}

export type KnowledgeState = Readonly<Record<string, number>>;

export interface QualificationProgress {
  earnedAt: number;
  qualificationId: string;
}

export type QualificationState = Readonly<Record<string, QualificationProgress>>;

export interface ConditionProgress {
  conditionId: string;
  expiresAt: number;
}

export type ConditionState = Readonly<Record<string, ConditionProgress>>;
export type ExamCooldownState = Readonly<Record<string, number>>;

export interface CareerProgress {
  careerId: string;
  enrolledAt: number;
  mastery: number;
  promotionReadyAt: number | null;
  rankId: string;
}

export type CareerState = Readonly<Record<string, CareerProgress>>;

export type Presentation =
  | "idle"
  | "walking"
  | "petted"
  | "playing"
  | "dragged"
  | "resting"
  | "studying"
  | "working"
  | "ill";

interface ActiveActivityBase {
  accumulatedMs: number;
  creditedGeneralXp: number;
  definitionId: string;
  durationMs: number;
  startedAt: number;
}

export interface ActiveJob extends ActiveActivityBase {
  creditedCoins: number;
  creditedMastery: number;
  type: "job";
}

export interface ActiveCareerJob extends ActiveActivityBase {
  careerId: string;
  creditedCareerXp: number;
  creditedCoins: number;
  type: "careerJob";
}

export interface ActiveStudy extends ActiveActivityBase {
  creditedKnowledge: number;
  gainMultiplier: number;
  knowledgeFieldId: string;
  type: "study";
}

export interface ActiveRest extends ActiveActivityBase {
  creditedEnergy: number;
  gainMultiplier: number;
  type: "rest";
}

export interface ActivePlay extends ActiveActivityBase {
  creditedAffection: number;
  creditedBond: number;
  creditedEnergyCost: number;
  creditedMood: number;
  creditedStressRecovery: number;
  type: "play";
}

export type ActiveActivity =
  | ActiveCareerJob
  | ActiveJob
  | ActivePlay
  | ActiveRest
  | ActiveStudy;

export interface PetState {
  activity: ActiveActivity | null;
  care: CareState;
  careers: CareerState;
  conditions: ConditionState;
  examCooldowns: ExamCooldownState;
  generalXp: number;
  household: HouseholdState;
  knowledge: KnowledgeState;
  mastery: number;
  needs: NeedState;
  petId: string;
  presentation: Presentation;
  presentationUntil: number | null;
  randomSeed: number;
  qualifications: QualificationState;
  relationship: RelationshipState;
  stateVersion: number;
  statusText: string;
  updatedAt: number;
}

export type PetMutableState = Partial<
  Omit<PetState, "petId" | "stateVersion">
>;

export interface PetSnapshot {
  state: PetState;
}

export interface PetPatch {
  baseVersion: number;
  changes: PetMutableState;
  nextVersion: number;
}

export type PetCommand =
  | { type: "cancelActivity" }
  | { type: "comfort" }
  | { careerId: string; type: "enrollCareer" }
  | { examId: string; type: "attemptExam" }
  | { type: "pet" }
  | { itemId: string; type: "purchaseItem" }
  | { careerId: string; type: "promoteCareer" }
  | { jobId: string; type: "startCareerJob" }
  | { jobId?: string | undefined; type: "startJob" }
  | { type: "startPlay" }
  | { type: "startRest" }
  | { studyId?: string | undefined; type: "startStudy" }
  | { type: "talk" }
  | { itemId: string; type: "useItem" }
  | { type: "walk" };

export interface WindowPoint {
  x: number;
  y: number;
}

export interface PersistedPetRecord {
  cleanExit: boolean;
  position: WindowPoint;
  savedAt: number;
  state: PetState;
}

export interface JobDefinition {
  completionMasteryBonus: number;
  demanding: boolean;
  durationMs: number;
  id: string;
  name: string;
  needCosts: NeedState;
  requiredLevel: number;
  rewardCoins: number;
  rewardGeneralXp: number;
  rewardMastery: number;
  stressCost: number;
}

export interface CareerRankDefinition {
  advancement: "automatic" | "enrollment" | "promotion";
  id: string;
  name: string;
  requiredKnowledge: number;
  requiredMastery: number;
}

export interface CareerDefinition {
  enrollmentKnowledge: {
    fieldId: string;
    minimum: number;
  };
  enrollmentQualificationId?: string | undefined;
  id: string;
  name: string;
  ranks: readonly CareerRankDefinition[];
}

export interface CareerJobDefinition {
  careerId: string;
  completionCareerXpBonus: number;
  demanding: boolean;
  durationMs: number;
  id: string;
  name: string;
  needCosts: NeedState;
  requiredRankId: string;
  rewardCareerXp: number;
  rewardCoins: number;
  rewardGeneralXp: number;
  stressCost: number;
}

export interface StudyDefinition {
  demanding: boolean;
  durationMs: number;
  id: string;
  knowledgeFieldId: string;
  name: string;
  needCosts: NeedState;
  rewardKnowledge: number;
  rewardGeneralXp: number;
  stressCost: number;
}

export interface ExamDefinition {
  coinCost: number;
  condition: {
    durationMs: number;
    id: string;
    name: string;
    studyMultiplier: number;
  };
  cooldownMs: number;
  energyCost: number;
  failureMoodCost: number;
  guaranteedKnowledge: number;
  id: string;
  knowledgeFieldId: string;
  minimumEnergy: number;
  minimumMood: number;
  name: string;
  qualificationId: string;
  riskChanceMaximum: number;
  riskChanceMinimum: number;
  riskMinimumKnowledge: number;
  unlockCareerId: string;
}

export interface RestDefinition {
  durationMs: number;
  id: string;
  name: string;
  recoveryEnergy: number;
  rewardGeneralXp: number;
  stressRecovery: number;
}

export interface PlayDefinition {
  affectionGain: number;
  bondGain: number;
  durationMs: number;
  energyCost: number;
  id: string;
  moodGain: number;
  name: string;
  rewardGeneralXp: number;
  stressRecovery: number;
}

export interface PersonalLevelDefinition {
  level: number;
  requiredXp: number;
}

export type ManagementTab = "work" | "careers" | "memories";
