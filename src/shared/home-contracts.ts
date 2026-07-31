import { z } from "zod";

export type {
  FurnitureKind,
  FurniturePlacement,
  HomeLayout,
  HomeLayoutSnapshot,
  HomePlacementIssue,
  HomePlacementValidation,
  SaveHomeLayoutCommand,
} from "./home-types.js";

export const FurnitureKindSchema = z.enum(["bed", "desk"]);

export const FurniturePlacementSchema = z.object({
  height: z.number().int().positive(),
  id: z.string().min(1),
  kind: FurnitureKindSchema,
  width: z.number().int().positive(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export const HomeLayoutSchema = z.object({
  furniture: z.array(FurniturePlacementSchema).readonly(),
  layoutVersion: z.number().int().nonnegative(),
  roomId: z.string().min(1),
});

export const HomeLayoutSnapshotSchema = z.object({
  layout: HomeLayoutSchema,
});

export const SaveHomeLayoutCommandSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  furniture: z.array(FurniturePlacementSchema).readonly(),
  type: z.literal("saveHomeLayout"),
});
