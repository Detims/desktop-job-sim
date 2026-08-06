import { describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import {
  DAILY_BOND_CAP,
  PET_COOLDOWN_MS,
  TALK_COOLDOWN_MS,
  applyAffectionElapsed,
  applyRelationshipGain,
  localDateKey,
  petRelationship,
  talkToPet,
} from "./relationship.js";

describe("relationship growth", () => {
  it("decays Affection slowly without reducing Bond", () => {
    const initial = {
      ...createInitialPetState(0),
      relationship: {
        ...createInitialPetState(0).relationship,
        affection: 50,
        bond: 12,
      },
    };
    const online = applyAffectionElapsed(initial, 3_600_000, 1);
    const offline = applyAffectionElapsed(initial, 3_600_000, 0.5);

    expect(online.relationship.affection).toBe(49);
    expect(offline.relationship.affection).toBe(49.5);
    expect(offline.relationship.bond).toBe(12);
  });

  it("caps daily Bond and resets only for a later local date", () => {
    const firstDay = new Date(2026, 7, 6, 12).getTime();
    const capped = applyRelationshipGain(
      createInitialPetState(firstDay),
      firstDay,
      0,
      8,
    );
    expect(capped.relationship.bond).toBe(DAILY_BOND_CAP);
    expect(capped.relationship.bondAwardDate).toBe(localDateKey(firstDay));

    const sameDay = applyRelationshipGain(capped, firstDay + 1_000, 2, 1);
    expect(sameDay.relationship.bond).toBe(DAILY_BOND_CAP);
    expect(sameDay.relationship.affection).toBe(52);

    const rolledBack = applyRelationshipGain(capped, firstDay - 86_400_000, 0, 1);
    expect(rolledBack.relationship.bond).toBe(DAILY_BOND_CAP);

    const nextDay = applyRelationshipGain(capped, firstDay + 86_400_000, 0, 1);
    expect(nextDay.relationship.bond).toBe(DAILY_BOND_CAP + 1);
    expect(nextDay.relationship.bondAwardedToday).toBe(1);
  });

  it("enforces Pet and Talk cooldowns", () => {
    const now = 1_000_000;
    const petted = petRelationship(createInitialPetState(now), now);
    expect(petted.relationship.affection).toBe(51);
    expect(petted.relationship.bond).toBeCloseTo(0.1);
    expect(petted.relationship.petCooldownUntil).toBe(now + PET_COOLDOWN_MS);
    expect(() => petRelationship(petted, now + 1)).toThrow("cooldown");

    const talked = talkToPet(petted, now);
    expect(talked.relationship.affection).toBe(54);
    expect(talked.relationship.bond).toBeCloseTo(0.4);
    expect(talked.relationship.talkCooldownUntil).toBe(now + TALK_COOLDOWN_MS);
    expect(() => talkToPet(talked, now + 1)).toThrow("cooldown");
  });

  it("records the Growing Closer threshold in durable state", () => {
    const initial = createInitialPetState(0);
    const nearlyThere = {
      ...initial,
      relationship: { ...initial.relationship, bond: 9.5 },
    };
    const crossed = applyRelationshipGain(nearlyThere, 0, 0, 0.5);
    expect(crossed.relationship.bond).toBe(10);
    expect(crossed.relationship.growingCloserRecorded).toBe(true);
  });
});
