export interface NeedState {
  energy: number;
  hunger: number;
  mood: number;
  thirst: number;
}

export type ActivityType = "job" | "rest" | "study";

export interface ActivityBonuses {
  restRecovery: number;
  studyGain: number;
}

export type KnowledgeState = Readonly<Record<string, number>>;

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

export type ActiveActivity = ActiveJob | ActiveRest | ActiveStudy;

export interface PetState {
  activity: ActiveActivity | null;
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
  | { type: "pet" }
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
