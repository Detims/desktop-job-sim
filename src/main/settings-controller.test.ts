import { describe, expect, it, vi } from "vitest";

import type { SettingsActivityRepository } from "../persistence/settings-activity-repository.js";
import { DEFAULT_APP_SETTINGS } from "../shared/settings-activity-types.js";
import { SettingsController } from "./settings-controller.js";

function repository(): SettingsActivityRepository {
  return {
    appendEvent: vi.fn(),
    loadActivityPage: vi.fn(),
    loadSettings: vi.fn(),
    pruneActivity: vi.fn(),
    saveSettings: vi.fn(),
  };
}

describe("SettingsController", () => {
  it("completes onboarding in one durable versioned update", () => {
    const storage = repository();
    const activity = vi.fn();
    const controller = new SettingsController(DEFAULT_APP_SETTINGS, storage, activity);

    const result = controller.completeOnboarding({
      autonomyMode: "carefulSpending",
      baseVersion: 0,
      careIntensity: "relaxed",
      petName: "  Mochi  ",
    }, 1_000);

    expect(result).toEqual(expect.objectContaining({
      autonomyMode: "carefulSpending",
      careIntensity: "relaxed",
      onboardingComplete: true,
      petName: "Mochi",
      settingsVersion: 1,
    }));
    expect(storage.saveSettings).toHaveBeenCalledWith(
      result,
      0,
      expect.objectContaining({ type: "settings.onboarding_completed" }),
    );
    expect(activity).toHaveBeenCalledTimes(1);
  });

  it("persists before publishing an authoritative settings change", () => {
    const storage = repository();
    const listener = vi.fn();
    const activity = vi.fn();
    const controller = new SettingsController(
      DEFAULT_APP_SETTINGS,
      storage,
      activity,
    );
    controller.subscribe(listener);

    const result = controller.update(
      {
        baseVersion: 0,
        update: { careIntensity: "demanding", type: "setCareIntensity" },
      },
      10_000,
    );

    expect(result).toEqual({
      ...DEFAULT_APP_SETTINGS,
      careIntensity: "demanding",
      settingsVersion: 1,
    });
    expect(storage.saveSettings).toHaveBeenCalledWith(
      result,
      0,
      expect.objectContaining({ type: "settings.care_intensity_changed" }),
      undefined,
    );
    expect(listener).toHaveBeenCalledWith(result);
    expect(activity).toHaveBeenCalledTimes(1);
  });

  it("prunes immediately when switching back to 30-day retention", () => {
    const storage = repository();
    const controller = new SettingsController(
      { ...DEFAULT_APP_SETTINGS, activityRetention: "indefinite" },
      storage,
    );
    const now = 40 * 24 * 60 * 60 * 1_000;

    controller.update(
      {
        baseVersion: 0,
        update: { activityRetention: "thirtyDays", type: "setActivityRetention" },
      },
      now,
    );

    expect(storage.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ activityRetention: "thirtyDays" }),
      0,
      expect.any(Object),
      10 * 24 * 60 * 60 * 1_000,
    );
  });

  it("persists autonomy mode and reserve changes as versioned settings", () => {
    const storage = repository();
    const activity = vi.fn();
    const controller = new SettingsController(
      DEFAULT_APP_SETTINGS,
      storage,
      activity,
    );

    const independent = controller.update(
      {
        baseVersion: 0,
        update: { autonomyMode: "independent", type: "setAutonomyMode" },
      },
      100,
    );
    const protectedBalance = controller.update(
      {
        baseVersion: 1,
        update: { autonomyReserve: 25, type: "setAutonomyReserve" },
      },
      200,
    );

    expect(independent.autonomyMode).toBe("independent");
    expect(protectedBalance).toEqual(expect.objectContaining({
      autonomyMode: "independent",
      autonomyReserve: 25,
      settingsVersion: 2,
    }));
    expect(storage.saveSettings).toHaveBeenNthCalledWith(
      1,
      independent,
      0,
      expect.objectContaining({ type: "settings.autonomy_mode_changed" }),
      undefined,
    );
    expect(storage.saveSettings).toHaveBeenNthCalledWith(
      2,
      protectedBalance,
      1,
      expect.objectContaining({ type: "settings.autonomy_reserve_changed" }),
      undefined,
    );
    expect(activity).toHaveBeenCalledTimes(2);
  });

  it("persists offline autonomy enablement and reward changes", () => {
    const storage = repository();
    const activity = vi.fn();
    const controller = new SettingsController(
      DEFAULT_APP_SETTINGS,
      storage,
      activity,
    );

    const enabled = controller.update(
      {
        baseVersion: 0,
        update: { offlineAutonomyEnabled: true, type: "setOfflineAutonomyEnabled" },
      },
      100,
    );
    const fullRewards = controller.update(
      {
        baseVersion: 1,
        update: { offlineRewardMultiplier: 1, type: "setOfflineRewardMultiplier" },
      },
      200,
    );

    expect(enabled.offlineAutonomyEnabled).toBe(true);
    expect(fullRewards).toEqual(expect.objectContaining({
      offlineAutonomyEnabled: true,
      offlineRewardMultiplier: 1,
      settingsVersion: 2,
    }));
    expect(storage.saveSettings).toHaveBeenNthCalledWith(
      1,
      enabled,
      0,
      expect.objectContaining({ type: "settings.offline_autonomy_changed" }),
      undefined,
    );
    expect(storage.saveSettings).toHaveBeenNthCalledWith(
      2,
      fullRewards,
      1,
      expect.objectContaining({ type: "settings.offline_reward_changed" }),
      undefined,
    );
    expect(activity).toHaveBeenCalledTimes(2);
  });

  it("does not publish or mutate when persistence fails", () => {
    const storage = repository();
    vi.mocked(storage.saveSettings).mockImplementation(() => {
      throw new Error("disk unavailable");
    });
    const listener = vi.fn();
    const controller = new SettingsController(DEFAULT_APP_SETTINGS, storage);
    controller.subscribe(listener);

    expect(() =>
      controller.update(
        {
          baseVersion: 0,
          update: { alwaysOnTop: false, type: "setAlwaysOnTop" },
        },
        20,
      ),
    ).toThrow("disk unavailable");
    expect(controller.getSnapshot()).toEqual(DEFAULT_APP_SETTINGS);
    expect(listener).not.toHaveBeenCalled();
  });
});
