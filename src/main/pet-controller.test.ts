import { describe, expect, it } from "vitest";

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
});
