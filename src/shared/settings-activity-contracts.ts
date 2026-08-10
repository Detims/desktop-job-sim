import { z } from "zod";

export type {
  ActivityCursor,
  ActivityPage,
  ActivityPageRequest,
  ActivityRetention,
  AppSettings,
  AutonomyMode,
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

export const OfflineRewardMultiplierSchema = z.union([
  z.literal(0),
  z.literal(0.25),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1),
]);

export const AutonomyModeSchema = z.enum([
  "manual",
  "ownedSupplies",
  "carefulSpending",
  "independent",
]);

export const AppSettingsSchema = z.object({
  activityRetention: ActivityRetentionSchema,
  alwaysOnTop: z.boolean(),
  autonomyMode: AutonomyModeSchema,
  autonomyReserve: z.number().int().min(0).max(1_000),
  careIntensity: CareIntensitySchema,
  offlineAutonomyEnabled: z.boolean(),
  offlineRewardMultiplier: OfflineRewardMultiplierSchema,
  settingsVersion: z.number().int().nonnegative(),
});

export const SettingsUpdateSchema = z.discriminatedUnion("type", [
  z.object({ careIntensity: CareIntensitySchema, type: z.literal("setCareIntensity") }),
  z.object({ alwaysOnTop: z.boolean(), type: z.literal("setAlwaysOnTop") }),
  z.object({ autonomyMode: AutonomyModeSchema, type: z.literal("setAutonomyMode") }),
  z.object({ autonomyReserve: z.number().int().min(0).max(1_000), type: z.literal("setAutonomyReserve") }),
  z.object({ offlineAutonomyEnabled: z.boolean(), type: z.literal("setOfflineAutonomyEnabled") }),
  z.object({ offlineRewardMultiplier: OfflineRewardMultiplierSchema, type: z.literal("setOfflineRewardMultiplier") }),
  z.object({ activityRetention: ActivityRetentionSchema, type: z.literal("setActivityRetention") }),
]);

export const UpdateSettingsCommandSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  update: SettingsUpdateSchema,
});

export const MeaningfulEventTypeSchema = z.enum([
  "progression.level_up",
  "activity.started",
  "activity.completed",
  "activity.cancelled",
  "activity.shutdown_settled",
  "activity.sleep_settled",
  "activity.crash_recovered",
  "autonomy.action",
  "autonomy.blocked",
  "offline.summary",
  "offline.action",
  "offline.blocked",
  "exam.failed",
  "exam.passed",
  "career.enrolled",
  "career.advanced",
  "career.promotion_ready",
  "career.promoted",
  "home.layout_saved",
  "care.item_purchased",
  "care.item_used",
  "care.comforted",
  "care.serious_illness",
  "care.recovered",
  "care.burnout_started",
  "care.burnout_recovered",
  "relationship.comforted",
  "relationship.gifted",
  "relationship.petted",
  "relationship.talked",
  "relationship.milestone",
  "character.installed",
  "character.applied",
  "character.removed",
  "startup.recovered",
  "settings.care_intensity_changed",
  "settings.autonomy_mode_changed",
  "settings.autonomy_reserve_changed",
  "settings.offline_autonomy_changed",
  "settings.offline_reward_changed",
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
