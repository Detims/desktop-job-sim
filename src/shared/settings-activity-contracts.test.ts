import { describe, expect, it } from "vitest";

import {
  AppSettingsSchema,
  UpdateSettingsCommandSchema,
} from "./settings-activity-contracts.js";
import { DEFAULT_APP_SETTINGS } from "./settings-activity-types.js";

describe("autonomy settings contracts", () => {
  it("accepts all four autonomy modes", () => {
    for (const autonomyMode of [
      "manual",
      "ownedSupplies",
      "carefulSpending",
      "independent",
    ] as const) {
      expect(AppSettingsSchema.parse({
        ...DEFAULT_APP_SETTINGS,
        autonomyMode,
      }).autonomyMode).toBe(autonomyMode);
    }
  });

  it("restricts the reserve to whole coins from zero through one thousand", () => {
    expect(UpdateSettingsCommandSchema.parse({
      baseVersion: 0,
      update: { autonomyReserve: 0, type: "setAutonomyReserve" },
    }).update).toEqual({ autonomyReserve: 0, type: "setAutonomyReserve" });
    expect(() => UpdateSettingsCommandSchema.parse({
      baseVersion: 0,
      update: { autonomyReserve: -1, type: "setAutonomyReserve" },
    })).toThrow();
    expect(() => UpdateSettingsCommandSchema.parse({
      baseVersion: 0,
      update: { autonomyReserve: 10.5, type: "setAutonomyReserve" },
    })).toThrow();
    expect(() => UpdateSettingsCommandSchema.parse({
      baseVersion: 0,
      update: { autonomyReserve: 1_001, type: "setAutonomyReserve" },
    })).toThrow();
  });

  it("accepts only the five snapping offline reward levels", () => {
    for (const offlineRewardMultiplier of [0, 0.25, 0.5, 0.75, 1]) {
      expect(AppSettingsSchema.parse({
        ...DEFAULT_APP_SETTINGS,
        offlineRewardMultiplier,
      }).offlineRewardMultiplier).toBe(offlineRewardMultiplier);
    }
    expect(() => AppSettingsSchema.parse({
      ...DEFAULT_APP_SETTINGS,
      offlineRewardMultiplier: 0.4,
    })).toThrow();
  });
});
