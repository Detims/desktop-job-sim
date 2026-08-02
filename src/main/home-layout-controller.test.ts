import { describe, expect, it, vi } from "vitest";

import { createInitialHomeLayout } from "../domain/home-layout.js";
import type { HomeLayoutRepository } from "../persistence/home-layout-repository.js";
import { PersistenceError } from "../persistence/persistence-error.js";
import { HomeLayoutController } from "./home-layout-controller.js";

function repository(): HomeLayoutRepository {
  return {
    loadHomeLayout: vi.fn(),
    saveHomeLayout: vi.fn(),
  };
}

describe("HomeLayoutController", () => {
  it("persists an entire valid layout before updating its snapshot", () => {
    const storage = repository();
    const controller = new HomeLayoutController(
      createInitialHomeLayout(),
      storage,
    );
    const furniture = controller.getSnapshot().layout.furniture.map((item) =>
      item.kind === "desk" ? { ...item, x: 7, y: 4 } : item,
    );

    const result = controller.save({
      baseVersion: 0,
      furniture,
      type: "saveHomeLayout",
    });

    expect(result.layout.layoutVersion).toBe(1);
    expect(storage.saveHomeLayout).toHaveBeenCalledWith(
      result.layout,
      0,
      expect.objectContaining({ type: "home.layout_saved" }),
    );
    expect(controller.getSnapshot()).toEqual(result);
  });

  it("keeps the old snapshot when persistence fails", () => {
    const storage = repository();
    vi.mocked(storage.saveHomeLayout).mockImplementation(() => {
      throw new PersistenceError("database.home_layout_save_failed", "nope");
    });
    const initial = createInitialHomeLayout();
    const controller = new HomeLayoutController(initial, storage);

    expect(() =>
      controller.save({
        baseVersion: 0,
        furniture: initial.furniture.map((item) => ({ ...item, y: item.y + 3 })),
        type: "saveHomeLayout",
      }),
    ).toThrowError(expect.objectContaining({
      eventCode: "database.home_layout_save_failed",
    }));
    expect(controller.getSnapshot().layout).toEqual(initial);
  });

  it("rejects stale versions and invalid placement before persistence", () => {
    const storage = repository();
    const initial = createInitialHomeLayout();
    const controller = new HomeLayoutController(initial, storage);

    expect(() =>
      controller.save({
        baseVersion: 1,
        furniture: initial.furniture,
        type: "saveHomeLayout",
      }),
    ).toThrowError(expect.objectContaining({ eventCode: "home.layout_conflict" }));
    expect(() =>
      controller.save({
        baseVersion: 0,
        furniture: initial.furniture.map((item) => ({ ...item, x: 11 })),
        type: "saveHomeLayout",
      }),
    ).toThrow("Invalid home furniture");
    expect(storage.saveHomeLayout).not.toHaveBeenCalled();
  });
});
