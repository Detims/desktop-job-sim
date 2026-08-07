import { describe, expect, it } from "vitest";
import { createInitialPetState } from "../simulation/pet-simulation.js";
import {
  applyBurnoutExposure,
  BURNOUT_CONDITION_ID,
  BURNOUT_DEFINITION,
  BURNOUT_PROTECTION_MS,
  isBurnedOut,
  positiveMoodGain,
  reconcileBurnoutState,
  shortenBurnoutRecovery,
} from "./burnout.js";

function stressedState(now = 0) {
  const state = createInitialPetState(now);
  return {
    ...state,
    care: { ...state.care, stress: 80 },
  };
}

describe("burnout", () => {
  it("starts after sixty seconds of high-stress work exposure", () => {
    const almost = applyBurnoutExposure(stressedState(), 59_999, 59_999, "work");
    expect(isBurnedOut(almost)).toBe(false);
    expect(almost.care.overworkExposureMs).toBe(59_999);

    const started = applyBurnoutExposure(almost, 1, 60_000, "work");
    expect(started.conditions[BURNOUT_CONDITION_ID]).toEqual({
      conditionId: BURNOUT_CONDITION_ID,
      expiresAt: 60_000 + BURNOUT_DEFINITION.durationMs,
    });
  });

  it("starts immediately at critical stress and low energy", () => {
    const state = stressedState();
    const started = applyBurnoutExposure({
      ...state,
      care: { ...state.care, stress: 90 },
      needs: { ...state.needs, energy: 20 },
    }, 0, 1_000, "none");
    expect(isBurnedOut(started)).toBe(true);
  });

  it("drains exposure twice as fast during recovery and resets below 50 stress", () => {
    const state = stressedState();
    const exposed = {
      ...state,
      care: { ...state.care, overworkExposureMs: 40_000 },
    };
    expect(
      applyBurnoutExposure(exposed, 5_000, 5_000, "recovery").care
        .overworkExposureMs,
    ).toBe(30_000);
    expect(
      applyBurnoutExposure({
        ...exposed,
        care: { ...exposed.care, stress: 49 },
      }, 0, 5_000, "none").care.overworkExposureMs,
    ).toBe(0);
  });

  it("expires offline-compatible wall-clock state into recurrence protection", () => {
    const state = stressedState();
    const burnedOut = {
      ...state,
      care: { ...state.care, overworkExposureMs: 60_000 },
      conditions: {
        [BURNOUT_CONDITION_ID]: {
          conditionId: BURNOUT_CONDITION_ID,
          expiresAt: 10_000,
        },
      },
    };
    const recovered = reconcileBurnoutState(burnedOut, 10_000);
    expect(isBurnedOut(recovered)).toBe(false);
    expect(recovered.care.overworkExposureMs).toBe(0);
    expect(recovered.care.burnoutProtectedUntil).toBe(10_000 + BURNOUT_PROTECTION_MS);
    expect(isBurnedOut(applyBurnoutExposure(recovered, 60_000, 70_000, "work"))).toBe(false);
  });

  it("shortens recovery proportionally without refreshing or stacking", () => {
    const state = stressedState();
    const burnedOut = {
      ...state,
      conditions: {
        [BURNOUT_CONDITION_ID]: {
          conditionId: BURNOUT_CONDITION_ID,
          expiresAt: 600_000,
        },
      },
    };
    const shortened = shortenBurnoutRecovery(burnedOut, 7_500, 15_000, 10_000);
    expect(shortened.conditions[BURNOUT_CONDITION_ID]?.expiresAt).toBe(540_000);
    expect(positiveMoodGain(shortened, 8)).toBe(6);
  });
});
