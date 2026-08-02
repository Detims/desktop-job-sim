export type CareIntensity =
  | "sandbox"
  | "relaxed"
  | "balanced"
  | "demanding";

export type ActivityRetention = "thirtyDays" | "indefinite";

export interface AppSettings {
  activityRetention: ActivityRetention;
  alwaysOnTop: boolean;
  careIntensity: CareIntensity;
  settingsVersion: number;
}

export type SettingsUpdate =
  | { careIntensity: CareIntensity; type: "setCareIntensity" }
  | { alwaysOnTop: boolean; type: "setAlwaysOnTop" }
  | { activityRetention: ActivityRetention; type: "setActivityRetention" };

export interface UpdateSettingsCommand {
  baseVersion: number;
  update: SettingsUpdate;
}

export type MeaningfulEventType =
  | "activity.started"
  | "activity.completed"
  | "activity.cancelled"
  | "activity.shutdown_settled"
  | "activity.sleep_settled"
  | "activity.crash_recovered"
  | "home.layout_saved"
  | "startup.recovered"
  | "settings.care_intensity_changed"
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
  careIntensity: "balanced",
  settingsVersion: 0,
});

export const ACTIVITY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
