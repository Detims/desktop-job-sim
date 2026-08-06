import { z } from "zod";

export const MemoryCategorySchema = z.enum(["career", "illness", "qualification"]);
export const MemoryEntrySchema = z.object({
  category: MemoryCategorySchema,
  description: z.string().min(1),
  memoryId: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
  petId: z.string().min(1),
  title: z.string().min(1),
});
export const MemoryCursorSchema = z.object({
  memoryId: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
});
export const MemoryPageRequestSchema = z.object({
  before: MemoryCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export const MemoryPageSchema = z.object({
  memories: z.array(MemoryEntrySchema),
  nextCursor: MemoryCursorSchema.nullable(),
});

export type {
  MemoryCursor,
  MemoryEntry,
  MemoryEntryDraft,
  MemoryPage,
  MemoryPageRequest,
} from "./memory-types.js";
