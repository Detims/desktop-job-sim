import { describe, expect, it } from "vitest";

import { createInitialPetState, PROTOTYPE_JOB, startPrototypeJob } from "../simulation/pet-simulation.js";
import type { AutonomyPolicy } from "./autonomy.js";
import { evaluateAutonomy } from "./autonomy.js";
import { BURNOUT_CONDITION_ID } from "./burnout.js";

const POLICY: AutonomyPolicy = { mode: "independent", reserveCoins: 10 };

function state() {
  return createInitialPetState(1_000);
}

describe("evaluateAutonomy", () => {
  it("does nothing in Manual mode", () => {
    const thirsty = { ...state(), needs: { ...state().needs, thirst: 10 } };
    expect(evaluateAutonomy(thirsty, { mode: "manual", reserveCoins: 10 }, PROTOTYPE_JOB)).toBeNull();
  });

  it("uses owned essentials before buying and excludes premium food", () => {
    const hungry = {
      ...state(),
      household: {
        inventory: { "core:basic-meal": 1, "core:deluxe-meal": 1 },
        wallet: 100,
      },
      needs: { ...state().needs, hunger: 25 },
    };
    expect(evaluateAutonomy(hungry, POLICY, PROTOTYPE_JOB)).toEqual({
      itemId: "core:basic-meal",
      trigger: "hunger",
      type: "useItem",
    });

    const premiumOnly = {
      ...hungry,
      household: { inventory: { "core:deluxe-meal": 1 }, wallet: 100 },
    };
    expect(evaluateAutonomy(premiumOnly, { mode: "ownedSupplies", reserveCoins: 10 }, PROTOTYPE_JOB)).toEqual(
      expect.objectContaining({ code: "autonomy.essential_not_owned", type: "blocked" }),
    );
  });

  it("preserves the reserve normally and breaches it only at a critical need", () => {
    const thirsty = {
      ...state(),
      household: { inventory: {}, wallet: 12 },
      needs: { ...state().needs, thirst: 25 },
    };
    expect(evaluateAutonomy(thirsty, { mode: "carefulSpending", reserveCoins: 10 }, PROTOTYPE_JOB)).toBeNull();
    expect(evaluateAutonomy(
      { ...thirsty, needs: { ...thirsty.needs, thirst: 10 } },
      { mode: "carefulSpending", reserveCoins: 10 },
      PROTOTYPE_JOB,
    )).toEqual({ emergency: true, itemId: "core:water", trigger: "thirst", type: "purchaseItem" });
  });

  it("uses Medicine first and permits its emergency reserve exception", () => {
    const ill = {
      ...state(),
      care: {
        ...state().care,
        seriousIllness: { medicineUsed: false, recoverAt: 20_000, startedAt: 1_000 },
      },
      household: { inventory: {}, wallet: 20 },
    };
    expect(evaluateAutonomy(ill, { mode: "carefulSpending", reserveCoins: 10 }, PROTOTYPE_JOB)).toEqual({
      emergency: true,
      itemId: "core:medicine",
      trigger: "health",
      type: "purchaseItem",
    });
  });

  it("starts only safe subsistence work in Independent mode", () => {
    const thirsty = {
      ...state(),
      household: { inventory: {}, wallet: 0 },
      needs: { ...state().needs, thirst: 25 },
    };
    expect(evaluateAutonomy(thirsty, POLICY, PROTOTYPE_JOB)).toEqual({
      jobId: PROTOTYPE_JOB.id,
      trigger: "thirst",
      type: "startJob",
    });
    expect(evaluateAutonomy(
      { ...thirsty, needs: { ...thirsty.needs, thirst: 10 } },
      POLICY,
      PROTOTYPE_JOB,
    )).toEqual(expect.objectContaining({ code: "autonomy.no_safe_action", type: "blocked" }));
  });

  it("cancels work, study, or play at unsafe thresholds or Burnout", () => {
    const working = startPrototypeJob(state(), 1_000);
    expect(evaluateAutonomy(
      { ...working, needs: { ...working.needs, energy: 10 } },
      POLICY,
      PROTOTYPE_JOB,
    )).toEqual(expect.objectContaining({ trigger: "energy", type: "cancelActivity" }));

    expect(evaluateAutonomy(
      {
        ...working,
        conditions: {
          [BURNOUT_CONDITION_ID]: { conditionId: BURNOUT_CONDITION_ID, expiresAt: 50_000 },
        },
      },
      POLICY,
      PROTOTYPE_JOB,
    )).toEqual(expect.objectContaining({ reason: expect.stringContaining("Burnout"), type: "cancelActivity" }));
  });

  it("uses deterministic priority when several needs qualify", () => {
    const depleted = {
      ...state(),
      household: { inventory: { "core:basic-meal": 1, "core:soap": 1, "core:water": 1 }, wallet: 0 },
      needs: { energy: 10, hunger: 10, mood: 100, thirst: 10 },
      care: { ...state().care, hygiene: 10 },
    };
    expect(evaluateAutonomy(depleted, POLICY, PROTOTYPE_JOB)).toEqual({
      itemId: "core:water",
      trigger: "thirst",
      type: "useItem",
    });
  });
});
