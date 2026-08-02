import { materializeEvent } from "../shared/meaningful-event.js";
import type { SettingsActivityRepository } from "../persistence/settings-activity-repository.js";
import { PersistenceError } from "../persistence/persistence-error.js";
import {
  ACTIVITY_RETENTION_MS,
  type AppSettings,
  type MeaningfulEvent,
  type MeaningfulEventDraft,
  type UpdateSettingsCommand,
} from "../shared/settings-activity-types.js";

type SettingsListener = (settings: AppSettings) => void;
type ActivityListener = (event: MeaningfulEvent) => void;

export class SettingsController {
  private readonly listeners = new Set<SettingsListener>();
  private settings: AppSettings;

  constructor(
    initialSettings: AppSettings,
    private readonly repository: SettingsActivityRepository,
    private readonly onActivity?: ActivityListener,
  ) {
    this.settings = structuredClone(initialSettings);
  }

  getSnapshot(): AppSettings {
    return structuredClone(this.settings);
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(command: UpdateSettingsCommand, now: number): AppSettings {
    if (command.baseVersion !== this.settings.settingsVersion) {
      throw new PersistenceError(
        "settings.version_conflict",
        "Settings changed before this update could be applied.",
      );
    }

    const current = this.settings;
    let next: AppSettings;
    let eventDraft: MeaningfulEventDraft;
    switch (command.update.type) {
      case "setCareIntensity":
        next = { ...current, careIntensity: command.update.careIntensity };
        eventDraft = {
          details: { from: current.careIntensity, to: next.careIntensity },
          summary: `Care intensity changed to ${next.careIntensity}.`,
          type: "settings.care_intensity_changed" as const,
        };
        break;
      case "setAlwaysOnTop":
        next = { ...current, alwaysOnTop: command.update.alwaysOnTop };
        eventDraft = {
          details: { enabled: next.alwaysOnTop },
          summary: `Always on top ${next.alwaysOnTop ? "enabled" : "disabled"}.`,
          type: "settings.always_on_top_changed" as const,
        };
        break;
      case "setActivityRetention":
        next = { ...current, activityRetention: command.update.activityRetention };
        eventDraft = {
          details: { from: current.activityRetention, to: next.activityRetention },
          summary: `Activity retention changed to ${next.activityRetention === "indefinite" ? "indefinite" : "30 days"}.`,
          type: "settings.retention_changed" as const,
        };
        break;
    }

    if (
      next.careIntensity === current.careIntensity &&
      next.alwaysOnTop === current.alwaysOnTop &&
      next.activityRetention === current.activityRetention
    ) {
      return this.getSnapshot();
    }

    next = { ...next, settingsVersion: current.settingsVersion + 1 };
    const event = materializeEvent(eventDraft, now);
    const pruneOlderThan =
      command.update.type === "setActivityRetention" &&
      command.update.activityRetention === "thirtyDays"
        ? now - ACTIVITY_RETENTION_MS
        : undefined;
    this.repository.saveSettings(next, current.settingsVersion, event, pruneOlderThan);
    this.settings = structuredClone(next);
    this.onActivity?.(structuredClone(event));
    for (const listener of this.listeners) listener(this.getSnapshot());
    return this.getSnapshot();
  }
}
