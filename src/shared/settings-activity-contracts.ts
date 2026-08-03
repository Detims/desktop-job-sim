import { z } from "zod";

export type {
  ActivityCursor,
  ActivityPage,
  ActivityPageRequest,
  ActivityRetention,
  AppSettings,
  CareIntensity,
  EventDetailValue,
  MeaningfulEvent,
  MeaningfulEventDraft,
  MeaningfulEventType,
  SettingsUpdate,
  UpdateSettingsCommand,
} from "./settings-activity-types.js";

export const CareIntensitySchema = z.enum([
  "sandbox",
  "relaxed",
  "balanced",
  "demanding",
]);

export const ActivityRetentionSchema = z.enum(["thirtyDays", "indefinite"]);

export const AppSettingsSchema = z.object({
  activityRetention: ActivityRetentionSchema,
  alwaysOnTop: z.boolean(),
  careIntensity: CareIntensitySchema,
  settingsVersion: z.number().int().nonnegative(),
});

export const SettingsUpdateSchema = z.discriminatedUnion("type", [
  z.object({ careIntensity: CareIntensitySchema, type: z.literal("setCareIntensity") }),
  z.object({ alwaysOnTop: z.boolean(), type: z.literal("setAlwaysOnTop") }),
  z.object({ activityRetention: ActivityRetentionSchema, type: z.literal("setActivityRetention") }),
]);

export const UpdateSettingsCommandSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  update: SettingsUpdateSchema,
});

export const MeaningfulEventTypeSchema = z.enum([
  "activity.started",
  "activity.completed",
  "activity.cancelled",
  "activity.shutdown_settled",
  "activity.sleep_settled",
  "activity.crash_recovered",
  "career.enrolled",
  "career.advanced",
  "career.promotion_ready",
  "career.promoted",
  "home.layout_saved",
  "startup.recovered",
  "settings.care_intensity_changed",
  "settings.always_on_top_changed",
  "settings.retention_changed",
]);

const EventDetailValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.null(),
]);

export const MeaningfulEventSchema = z.object({
  details: z.record(z.string(), EventDetailValueSchema),
  eventId: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
  petId: z.string().min(1).optional(),
  retention: z.literal("standard"),
  summary: z.string().min(1),
  type: MeaningfulEventTypeSchema,
});

export const ActivityCursorSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
});

export const ActivityPageRequestSchema = z.object({
  before: ActivityCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const ActivityPageSchema = z.object({
  events: z.array(MeaningfulEventSchema),
  nextCursor: ActivityCursorSchema.nullable(),
});
