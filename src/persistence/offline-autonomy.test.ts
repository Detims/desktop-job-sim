import { describe, expect, it } from "vitest";

import { createInitialPetState, PROTOTYPE_JOB } from "../simulation/pet-simulation.js";
import { reconcileOfflineAutonomy, type OfflineAutonomyPolicy } from "./offline-autonomy.js";

const POLICY: OfflineAutonomyPolicy = {
  activityBonuses: { restRecovery: 0, studyGain: 0 },
  enabled: true,
  mode: "independent",
  reserveCoins: 10,
  rewardMultiplier: 0.5,
};

describe("offline autonomy reconciliation", () => {
  it("uses owned essentials and applies the offline reward multiplier to care XP", () => {
    const initial = createInitialPetState(0);
    const result = reconcileOfflineAutonomy({
      ...initial,
      household: { inventory: { "core:water": 1 }, wallet: 0 },
      needs: { ...initial.needs, thirst: 25 },
    }, 60_000, 0, 1, { ...POLICY, mode: "ownedSupplies" });

    expect(result.state.needs.thirst).toBeGreaterThan(54);
    expect(result.state.generalXp).toBe(0.5);
    expect(result.summary.itemsUsed).toEqual([
      { count: 1, itemId: "core:water", name: "Water" },
    ]);
    expect(result.summary.shouldShow).toBe(true);
  });

  it("works only until an essential can be bought while preserving the reserve", () => {
    const initial = createInitialPetState(0);
    const result = reconcileOfflineAutonomy({
      ...initial,
      household: { inventory: {}, wallet: 0 },
      needs: { ...initial.needs, thirst: 25 },
    }, 120_000, 0, 1, POLICY);

    expect(result.summary.jobsCompleted).toBe(3);
    expect(result.summary.itemsPurchased).toEqual([
      { count: 1, itemId: "core:water", name: "Water" },
    ]);
    expect(result.summary.itemsUsed).toEqual([
      { count: 1, itemId: "core:water", name: "Water" },
    ]);
    expect(result.summary.coinsEarned).toBe(PROTOTYPE_JOB.rewardCoins * 0.5 * 3);
    expect(result.state.household.wallet).toBe(15);
  });

  it("never works when rewards are zero", () => {
    const initial = createInitialPetState(0);
    const result = reconcileOfflineAutonomy({
      ...initial,
      household: { inventory: {}, wallet: 0 },
      needs: { ...initial.needs, thirst: 25 },
    }, 120_000, 0, 1, { ...POLICY, rewardMultiplier: 0 });

    expect(result.summary.jobsCompleted).toBe(0);
    expect(result.summary.blocked).toContain("Offline work rewards are disabled.");
    expect(result.state.household.wallet).toBe(0);
  });

  it("does not act when disabled or Manual but still applies offline decay", () => {
    const initial = createInitialPetState(0);
    const disabled = reconcileOfflineAutonomy(initial, 3_600_000, 0, 1, {
      ...POLICY,
      enabled: false,
    });
    const manual = reconcileOfflineAutonomy(initial, 3_600_000, 0, 1, {
      ...POLICY,
      mode: "manual",
    });

    expect(disabled.state.needs).toEqual(manual.state.needs);
    expect(disabled.state.needs.thirst).toBeCloseTo(initial.needs.thirst - 1.25);
    expect(disabled.summary.itemsUsed).toEqual([]);
  });

  it("uses Medicine for an existing illness and evaluates a new illness only at the end", () => {
    const initial = createInitialPetState(0);
    const existing = reconcileOfflineAutonomy({
      ...initial,
      care: {
        ...initial.care,
        seriousIllness: { medicineUsed: false, recoverAt: 300_000, startedAt: 0 },
      },
      household: { inventory: { "core:medicine": 1 }, wallet: 0 },
    }, 60_000, 0, 1, { ...POLICY, mode: "ownedSupplies" });
    expect(existing.state.care.seriousIllness?.medicineUsed).toBe(true);
    expect(existing.summary.itemsUsed[0]?.itemId).toBe("core:medicine");

    const vulnerable = {
      ...initial,
      care: {
        ...initial.care,
        criticalExposureMs: { energy: 30 * 60_000, hunger: 0, thirst: 0 },
        health: 19,
      },
      needs: { ...initial.needs, energy: 0 },
    };
    const newlyIll = reconcileOfflineAutonomy(vulnerable, 1_000, 0, 1, {
      ...POLICY,
      enabled: false,
    });
    expect(newlyIll.state.care.seriousIllness).not.toBeNull();
    expect(newlyIll.summary.illness).toBe("started");
  });

  it("uses the saved bed bonus for offline Rest", () => {
    const initial = createInitialPetState(0);
    const withoutBed = reconcileOfflineAutonomy({
      ...initial,
      needs: { ...initial.needs, energy: 20 },
    }, 60_000, 0, 1, { ...POLICY, mode: "ownedSupplies" });
    const withBed = reconcileOfflineAutonomy({
      ...initial,
      needs: { ...initial.needs, energy: 20 },
    }, 60_000, 0, 1, {
      ...POLICY,
      activityBonuses: { restRecovery: 0.05, studyGain: 0.05 },
      mode: "ownedSupplies",
    });

    expect(withBed.state.needs.energy).toBeGreaterThan(withoutBed.state.needs.energy);
    expect(withBed.summary.restsCompleted).toBe(1);
  });
});
