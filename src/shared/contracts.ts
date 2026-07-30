import { z } from "zod";

export type {
  ActiveJob,
  JobDefinition,
  ManagementTab,
  NeedState,
  PetCommand,
  PetMutableState,
  PetPatch,
  PetSnapshot,
  PetState,
  Presentation,
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
  "working",
]);

export const ActiveJobSchema = z.object({
  accumulatedMs: z.number().nonnegative(),
  creditedCoins: z.number().nonnegative(),
  creditedMastery: z.number().nonnegative(),
  definitionId: z.string().min(1),
  durationMs: z.number().positive(),
  startedAt: z.number().nonnegative(),
});

export const PetStateSchema = z.object({
  activity: ActiveJobSchema.nullable(),
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

export const PetMutableStateSchema = PetStateSchema.omit({
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
  z.object({ type: z.literal("cancelJob") }),
  z.object({ type: z.literal("pet") }),
  z.object({ type: z.literal("startJob") }),
  z.object({ type: z.literal("walk") }),
]);

export const WindowPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
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
