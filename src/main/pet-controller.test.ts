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
    expect(events.map((event) => event.type)).toEqual([
      "care.item_purchased",
      "care.item_used",
    ]);
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
