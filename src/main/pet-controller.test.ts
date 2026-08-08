import { describe, expect, it } from "vitest";

import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";
import type { MemoryEntryDraft } from "../shared/memory-types.js";
import { PetController } from "./pet-controller.js";

describe("PetController", () => {
  it("publishes monotonic patches for accepted commands", async () => {
    const controller = new PetController(1_000);
    const patches: Array<{
      baseVersion: number;
      nextVersion: number;
    }> = [];
    controller.subscribe((patch) => {
      patches.push(patch);
    });

    await controller.dispatch({ type: "pet" }, 1_100);
    await controller.dispatch({ type: "walk" }, 1_200);

    expect(patches).toEqual([
      expect.objectContaining({ baseVersion: 0, nextVersion: 1 }),
      expect.objectContaining({ baseVersion: 1, nextVersion: 2 }),
    ]);
    expect(controller.getSnapshot().state.stateVersion).toBe(2);
  });

  it("returns from temporary presentation to the logical activity", async () => {
    const controller = new PetController(1_000);
    await controller.dispatch({ type: "startJob" }, 1_100);
    await controller.dispatch({ type: "pet" }, 1_200);

    expect(controller.getSnapshot().state.presentation).toBe("petted");
    controller.tick(1_000, 2_200);
    expect(controller.getSnapshot().state.presentation).toBe("working");
  });

  it("does not expose a command when its durable commit fails", async () => {
    const controller = new PetController(1_000, () => {
      throw new Error("disk unavailable");
    });

    await expect(
      controller.dispatch({ type: "pet" }, 1_100),
    ).rejects.toThrow("disk unavailable");
    expect(controller.getSnapshot().state.stateVersion).toBe(0);
    expect(controller.getSnapshot().state.needs.mood).toBe(90);
    expect(controller.getSnapshot().state.generalXp).toBe(0);
  });

  it("does not expose a household purchase when its durable commit fails", async () => {
    const initial = new PetController(1_000).getSnapshot().state;
    const controller = new PetController(
      { ...initial, household: { inventory: {}, wallet: 10 } },
      () => { throw new Error("disk unavailable"); },
    );

    await expect(
      controller.dispatch({ itemId: "core:water", type: "purchaseItem" }, 1_100),
    ).rejects.toThrow("disk unavailable");
    expect(controller.getSnapshot().state.household).toEqual({
      inventory: {},
      wallet: 10,
    });
  });

  it("commits care purchases and uses with meaningful events", async () => {
    const initial = new PetController(1_000).getSnapshot().state;
    const events: MeaningfulEventDraft[] = [];
    const controller = new PetController(
      {
        ...initial,
        household: { inventory: {}, wallet: 10 },
        needs: { ...initial.needs, thirst: 60 },
      },
      (_state, _now, drafts = []) => events.push(...drafts),
    );

    await controller.dispatch({ itemId: "core:water", type: "purchaseItem" }, 1_100);
    await controller.dispatch({ itemId: "core:water", type: "useItem" }, 1_200);

    expect(controller.getSnapshot().state.household.wallet).toBe(7);
    expect(controller.getSnapshot().state.needs.thirst).toBe(90);
    expect(controller.getSnapshot().state.generalXp).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      "care.item_purchased",
      "care.item_used",
    ]);
  });

  it("durably records a level transition and Growing Up Memory exactly once", async () => {
    const base = new PetController(1_000).getSnapshot().state;
    const events: MeaningfulEventDraft[] = [];
    const memories: MemoryEntryDraft[] = [];
    const controller = new PetController(
      { ...base, generalXp: 49 },
      (_state, _now, drafts = [], memoryDrafts = []) => {
        events.push(...drafts);
        memories.push(...memoryDrafts);
      },
    );

    await controller.dispatch({ type: "pet" }, 2_000);
    controller.tick(1_000, 3_000);

    expect(controller.getSnapshot().state.generalXp).toBe(50);
    expect(events.filter(({ type }) => type === "progression.level_up")).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({ level: 2, requiredXp: 50 }),
      }),
    ]);
    expect(memories).toEqual([
      expect.objectContaining({ category: "personal-growth", title: "Growing Up" }),
    ]);
  });

  it("does not award General XP for a rejected intentional action", async () => {
    const controller = new PetController(1_000);
    await controller.dispatch({ type: "pet" }, 2_000);

    await expect(controller.dispatch({ type: "pet" }, 2_001)).rejects.toThrow(
      "cooldown",
    );

    expect(controller.getSnapshot().state.generalXp).toBe(1);
  });

  it("commits one permanent Memory when Serious Illness recovers", () => {
    const initial = new PetController(1_000).getSnapshot().state;
    const events: MeaningfulEventDraft[] = [];
    const memories: MemoryEntryDraft[] = [];
    const controller = new PetController(
      {
        ...initial,
        care: {
          ...initial.care,
          health: 12,
          seriousIllness: {
            medicineUsed: false,
            recoverAt: 2_000,
            startedAt: 1_000,
          },
        },
        presentation: "ill",
      },
      (_state, _now, drafts = [], memoryDrafts = []) => {
        events.push(...drafts);
        memories.push(...memoryDrafts);
      },
    );

    controller.tick(1_000, 2_000);
    controller.tick(1_000, 3_000);

    expect(events.filter((event) => event.type === "care.recovered")).toHaveLength(1);
    expect(memories).toEqual([
      expect.objectContaining({
        category: "illness",
        title: "Recovered from Serious Illness",
      }),
    ]);
  });

  it("durably records Burnout start and recovery once without a Memory", async () => {
    const initial = new PetController(0).getSnapshot().state;
    const events: MeaningfulEventDraft[] = [];
    const memories: MemoryEntryDraft[] = [];
    const controller = new PetController(
      {
        ...initial,
        care: {
          ...initial.care,
          overworkExposureMs: 59_000,
          stress: 80,
        },
      },
      (_state, _now, drafts = [], memoryDrafts = []) => {
        events.push(...drafts);
        memories.push(...memoryDrafts);
      },
    );

    await controller.dispatch({ type: "startStudy" }, 1_000);
    controller.tick(1_000, 2_000);
    expect(controller.getSnapshot().state.activity?.type).toBe("study");
    controller.tick(600_000, 602_000);
    controller.tick(1_000, 603_000);

    expect(events.filter(({ type }) => type === "care.burnout_started")).toHaveLength(1);
    expect(events.filter(({ type }) => type === "care.burnout_recovered")).toHaveLength(1);
    expect(memories).toEqual([]);
  });

  it("cancels demanding study with proportional progress when Burnout begins", async () => {
    const initial = new PetController(0).getSnapshot().state;
    const controller = new PetController({
      ...initial,
      care: {
        ...initial.care,
        overworkExposureMs: 59_000,
        stress: 80,
      },
    });

    await controller.dispatch(
      { studyId: "core:business-fundamentals", type: "startStudy" },
      1_000,
    );
    controller.tick(1_000, 2_000);

    expect(controller.getSnapshot().state.activity).toBeNull();
    expect(
      controller.getSnapshot().state.knowledge["core:business-administration"],
    ).toBeGreaterThan(0);
    expect(controller.getSnapshot().state.statusText).toContain("Burnout stopped");
  });

  it("commits Growing Closer exactly once with the relationship state", async () => {
    const initial = new PetController(1_000).getSnapshot().state;
    const memories: MemoryEntryDraft[] = [];
    const events: MeaningfulEventDraft[] = [];
    const controller = new PetController(
      {
        ...initial,
        relationship: { ...initial.relationship, bond: 9.5 },
      },
      (_state, _now, drafts = [], memoryDrafts = []) => {
        events.push(...drafts);
        memories.push(...memoryDrafts);
      },
    );

    await controller.dispatch({ type: "comfort" }, 2_000);
    await controller.dispatch({ type: "comfort" }, 62_000);

    expect(controller.getSnapshot().state.relationship).toMatchObject({
      bond: 10.5,
      growingCloserRecorded: true,
    });
    expect(memories).toEqual([
      expect.objectContaining({ category: "relationship", title: "Growing Closer" }),
    ]);
    expect(events.filter(({ type }) => type === "relationship.comforted")).toHaveLength(2);
  });

  it("settles proportional Play progress on interruption", async () => {
    const controller = new PetController(1_000);
    await controller.dispatch({ type: "startPlay" }, 2_000);

    const settled = controller.settleForInterruption(15_000, 17_000).state;

    expect(settled.activity).toBeNull();
    expect(settled.relationship.affection).toBeGreaterThan(53.9);
    expect(settled.relationship.bond).toBeCloseTo(0.5);
  });

  it("enforces one major activity and applies configured furniture bonuses", async () => {
    const controller = new PetController(
      {
        ...new PetController(1_000).getSnapshot().state,
        needs: {
          ...new PetController(1_000).getSnapshot().state.needs,
          mood: 50,
        },
      },
      undefined,
      { restRecovery: 0.05, studyGain: 0.05 },
    );

    await controller.dispatch({ type: "startStudy" }, 1_100);
    await controller.dispatch({ type: "startRest" }, 1_200);
    expect(controller.getSnapshot().state.activity?.type).toBe("study");

    controller.tick(15_000, 16_100);
    expect(
      controller.getSnapshot().state.knowledge["core:general"],
    ).toBeCloseTo(10.5);
  });

  it("settles and cancels study when the application is interrupted", async () => {
    const controller = new PetController(
      1_000,
      undefined,
      { restRecovery: 0.05, studyGain: 0.05 },
    );
    await controller.dispatch({ type: "startStudy" }, 1_100);

    const settled = controller.settleForInterruption(5_000, 6_100).state;

    expect(settled.activity).toBeNull();
    expect(settled.knowledge["core:general"]).toBeGreaterThan(0);
  });

  it("rejects a career job before authoritative enrollment", async () => {
    const controller = new PetController(1_000);

    await expect(
      controller.dispatch(
        { jobId: "core:clerk:organize-mail", type: "startCareerJob" },
        1_100,
      ),
    ).rejects.toThrow("still locked");
    expect(controller.getSnapshot().state.activity).toBeNull();
  });

  it("persists Clerk enrollment, advancement readiness, and promotion exactly once", async () => {
    const base = new PetController(1_000).getSnapshot().state;
    const durableEvents: MeaningfulEventDraft[] = [];
    const controller = new PetController(
      {
        ...base,
        knowledge: { "core:general": 25 },
      },
      (_state, _now, events = []) => durableEvents.push(...events),
    );

    await controller.dispatch(
      { careerId: "core:clerk", type: "enrollCareer" },
      1_100,
    );
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const startedAt = 2_000 + cycle * 20_000;
      await controller.dispatch(
        { jobId: "core:clerk:organize-mail", type: "startCareerJob" },
        startedAt,
      );
      controller.tick(15_000, startedAt + 15_000);
    }

    const ready = controller.getSnapshot().state.careers["core:clerk"];
    expect(ready).toMatchObject({
      mastery: 60,
      rankId: "core:clerk:clerk",
    });
    expect(ready?.promotionReadyAt).not.toBeNull();
    expect(
      durableEvents.filter((event) => event.type === "career.advanced"),
    ).toHaveLength(1);
    expect(
      durableEvents.filter((event) => event.type === "career.promotion_ready"),
    ).toHaveLength(1);

    await controller.dispatch(
      { careerId: "core:clerk", type: "promoteCareer" },
      130_000,
    );
    expect(
      controller.getSnapshot().state.careers["core:clerk"]?.rankId,
    ).toBe("core:clerk:senior");
    expect(
      durableEvents.filter((event) => event.type === "career.promoted"),
    ).toHaveLength(1);
    expect(
      durableEvents.filter((event) => event.type === "career.enrolled"),
    ).toHaveLength(1);
  });

  it("commits a guaranteed exam result, event, and memory together", async () => {
    const base = new PetController(1_000).getSnapshot().state;
    const durableEvents: MeaningfulEventDraft[] = [];
    const durableMemories: MemoryEntryDraft[] = [];
    const controller = new PetController(
      {
        ...base,
        knowledge: { ...base.knowledge, "core:business-administration": 15 },
      },
      (_state, _now, events = [], memories = []) => {
        durableEvents.push(...events);
        durableMemories.push(...memories);
      },
    );

    await controller.dispatch(
      { examId: "core:administrative-assistant-exam", type: "attemptExam" },
      2_000,
    );

    expect(durableEvents.map((event) => event.type)).toEqual(["exam.passed"]);
    expect(durableMemories).toEqual([
      expect.objectContaining({
        category: "qualification",
        title: "Administrative Assistant Certified",
      }),
    ]);
    expect(
      controller.getSnapshot().state.qualifications[
        "core:administrative-assistant-certification"
      ],
    ).toBeDefined();
  });
});
