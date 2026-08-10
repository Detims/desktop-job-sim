export type CareIntensity =
  | "sandbox"
  | "relaxed"
  | "balanced"
  | "demanding";

export type ActivityRetention = "thirtyDays" | "indefinite";

export type AutonomyMode =
  | "manual"
  | "ownedSupplies"
  | "carefulSpending"
  | "independent";

export interface AppSettings {
  activityRetention: ActivityRetention;
  alwaysOnTop: boolean;
  autonomyMode: AutonomyMode;
  autonomyReserve: number;
  careIntensity: CareIntensity;
  offlineAutonomyEnabled: boolean;
  offlineRewardMultiplier: number;
  settingsVersion: number;
}

export type SettingsUpdate =
  | { careIntensity: CareIntensity; type: "setCareIntensity" }
  | { alwaysOnTop: boolean; type: "setAlwaysOnTop" }
  | { autonomyMode: AutonomyMode; type: "setAutonomyMode" }
  | { autonomyReserve: number; type: "setAutonomyReserve" }
  | { offlineAutonomyEnabled: boolean; type: "setOfflineAutonomyEnabled" }
  | { offlineRewardMultiplier: number; type: "setOfflineRewardMultiplier" }
  | { activityRetention: ActivityRetention; type: "setActivityRetention" };

export interface UpdateSettingsCommand {
  baseVersion: number;
  update: SettingsUpdate;
}

export type MeaningfulEventType =
  | "progression.level_up"
  | "activity.started"
  | "activity.completed"
  | "activity.cancelled"
  | "activity.shutdown_settled"
  | "activity.sleep_settled"
  | "activity.crash_recovered"
  | "autonomy.action"
  | "autonomy.blocked"
  | "offline.summary"
  | "offline.action"
  | "offline.blocked"
  | "exam.failed"
  | "exam.passed"
  | "career.enrolled"
  | "career.advanced"
  | "career.promotion_ready"
  | "career.promoted"
  | "home.layout_saved"
  | "care.item_purchased"
  | "care.item_used"
  | "care.comforted"
  | "care.serious_illness"
  | "care.recovered"
  | "care.burnout_started"
  | "care.burnout_recovered"
  | "relationship.comforted"
  | "relationship.gifted"
  | "relationship.petted"
  | "relationship.talked"
  | "relationship.milestone"
  | "startup.recovered"
  | "settings.care_intensity_changed"
  | "settings.autonomy_mode_changed"
  | "settings.autonomy_reserve_changed"
  | "settings.offline_autonomy_changed"
  | "settings.offline_reward_changed"
  | "settings.always_on_top_changed"
  | "settings.retention_changed";

export type EventDetailValue = boolean | number | string | null;

export interface MeaningfulEvent {
  details: Readonly<Record<string, EventDetailValue>>;
  eventId: string;
  occurredAt: number;
  petId?: string;
  retention: "standard";
  summary: string;
  type: MeaningfulEventType;
}

export interface MeaningfulEventDraft {
  details?: Readonly<Record<string, EventDetailValue>>;
  petId?: string;
  summary: string;
  type: MeaningfulEventType;
}

export interface ActivityCursor {
  eventId: string;
  occurredAt: number;
}

export interface ActivityPageRequest {
  before?: ActivityCursor;
  limit?: number;
}

export interface ActivityPage {
  events: MeaningfulEvent[];
  nextCursor: ActivityCursor | null;
}

export const CARE_INTENSITY_MULTIPLIERS: Readonly<
  Record<CareIntensity, number>
> = Object.freeze({
  sandbox: 0,
  relaxed: 0.5,
  balanced: 1,
  demanding: 1.5,
});

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  activityRetention: "thirtyDays",
  alwaysOnTop: true,
  autonomyMode: "manual",
  autonomyReserve: 10,
  careIntensity: "balanced",
  offlineAutonomyEnabled: false,
  offlineRewardMultiplier: 0.5,
  settingsVersion: 0,
});

export const ACTIVITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
