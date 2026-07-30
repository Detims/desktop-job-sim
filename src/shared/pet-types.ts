export interface NeedState {
  energy: number;
  hunger: number;
  mood: number;
  thirst: number;
}

export type Presentation =
  | "idle"
  | "walking"
  | "petted"
  | "dragged"
  | "working";

export interface ActiveJob {
  accumulatedMs: number;
  creditedCoins: number;
  creditedMastery: number;
  definitionId: string;
  durationMs: number;
  startedAt: number;
}

export interface PetState {
  activity: ActiveJob | null;
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
  | { type: "cancelJob" }
  | { type: "pet" }
  | { type: "startJob" }
  | { type: "walk" };

export interface WindowPoint {
  x: number;
  y: number;
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

export type ManagementTab = "work" | "careers";
