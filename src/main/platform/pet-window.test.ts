import { describe, expect, it } from "vitest";

import {
  calculateInitialPetBounds,
  clampPetBoundsToWorkAreas,
  MINIMUM_VISIBLE_GRAB_AREA,
  PET_WINDOW_SIZE,
} from "./pet-window.js";

describe("calculateInitialPetBounds", () => {
  it("places the pet inside the bottom-right of the work area", () => {
    expect(
      calculateInitialPetBounds({
        height: 1040,
        width: 1920,
        x: 0,
        y: 0,
      }),
    ).toEqual({
      height: PET_WINDOW_SIZE.height,
      width: PET_WINDOW_SIZE.width,
      x: 1536,
      y: 696,
    });
  });

  it("preserves an offset monitor origin", () => {
    expect(
      calculateInitialPetBounds({
        height: 900,
        width: 1440,
        x: -1440,
        y: 120,
      }),
    ).toEqual({
      height: PET_WINDOW_SIZE.height,
      width: PET_WINDOW_SIZE.width,
      x: -384,
      y: 676,
    });
  });

  it("does not position before a work area smaller than the pet window", () => {
    expect(
      calculateInitialPetBounds({
        height: 160,
        width: 200,
        x: 50,
        y: 75,
      }),
    ).toEqual({
      height: PET_WINDOW_SIZE.height,
      width: PET_WINDOW_SIZE.width,
      x: 50,
      y: 75,
    });
  });
});

describe("clampPetBoundsToWorkAreas", () => {
  const workAreas = [
    { height: 1040, width: 1920, x: 0, y: 0 },
    { height: 900, width: 1440, x: -1440, y: 100 },
  ];

  it("allows partial off-screen placement while retaining the grab area", () => {
    expect(
      clampPetBoundsToWorkAreas(
        {
          height: PET_WINDOW_SIZE.height,
          width: PET_WINDOW_SIZE.width,
          x: 1890,
          y: 1020,
        },
        workAreas,
      ),
    ).toEqual({
      height: PET_WINDOW_SIZE.height,
      width: PET_WINDOW_SIZE.width,
      x: 1872,
      y: 992,
    });
  });

  it("selects the closest monitor for a far-off position", () => {
    const result = clampPetBoundsToWorkAreas(
      {
        height: PET_WINDOW_SIZE.height,
        width: PET_WINDOW_SIZE.width,
        x: -1900,
        y: 200,
      },
      workAreas,
    );

    expect(result.x).toBe(
      -1440 - PET_WINDOW_SIZE.width + MINIMUM_VISIBLE_GRAB_AREA,
    );
    expect(result.y).toBe(200);
  });
});
