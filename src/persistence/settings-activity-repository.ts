import type {
  ActivityCursor,
  ActivityPage,
  AppSettings,
  MeaningfulEvent,
} from "../shared/settings-activity-types.js";

export interface SettingsActivityRepository {
  appendEvent(event: MeaningfulEvent): void;
  loadActivityPage(before: ActivityCursor | undefined, limit: number): ActivityPage;
  loadSettings(): AppSettings;
  pruneActivity(olderThan: number): number;
  saveSettings(
    settings: AppSettings,
    expectedVersion: number,
    event: MeaningfulEvent,
    pruneOlderThan?: number,
  ): void;
}
