export interface NeedState {
  energy: number;
  hunger: number;
  mood: number;
  thirst: number;
}

export type ActivityType = "careerJob" | "job" | "rest" | "study";

export interface ActivityBonuses {
  restRecovery: number;
  studyGain: number;
}

export type KnowledgeState = Readonly<Record<string, number>>;

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
  | "dragged"
  | "resting"
  | "studying"
  | "working";

interface ActiveActivityBase {
  accumulatedMs: number;
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

export type ActiveActivity =
  | ActiveCareerJob
  | ActiveJob
  | ActiveRest
  | ActiveStudy;

export interface PetState {
  activity: ActiveActivity | null;
  careers: CareerState;
  knowledge: KnowledgeState;
  mastery: number;
  needs: NeedState;
  petId: string;
  presentation: Presentation;
  presentationUntil: number | null;
  randomSeed: number;
  stateVersion: number;
  statusText: string;
  updatedAt: number;
  wallet: number;
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
  | { careerId: string; type: "enrollCareer" }
  | { type: "pet" }
  | { careerId: string; type: "promoteCareer" }
  | { jobId: string; type: "startCareerJob" }
  | { type: "startJob" }
  | { type: "startRest" }
  | { type: "startStudy" }
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
  durationMs: number;
  id: string;
  name: string;
  needCosts: NeedState;
  rewardCoins: number;
  rewardMastery: number;
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
  id: string;
  name: string;
  ranks: readonly CareerRankDefinition[];
}

export interface CareerJobDefinition {
  careerId: string;
  completionCareerXpBonus: number;
  durationMs: number;
  id: string;
  name: string;
  needCosts: NeedState;
  requiredRankId: string;
  rewardCareerXp: number;
  rewardCoins: number;
}

export interface StudyDefinition {
  durationMs: number;
  id: string;
  knowledgeFieldId: string;
  name: string;
  needCosts: NeedState;
  rewardKnowledge: number;
}

export interface RestDefinition {
  durationMs: number;
  id: string;
  name: string;
  recoveryEnergy: number;
}

export type ManagementTab = "work" | "careers";
