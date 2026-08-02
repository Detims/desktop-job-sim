import { describe, expect, it } from "vitest";

import { createInitialHomeLayout } from "./home-layout.js";
import {
  FURNITURE_BONUS_CAP,
  resolveFurnitureBonuses,
} from "./furniture-bonuses.js";

describe("furniture activity bonuses", () => {
  it("resolves one capped passive bonus for each saved furniture kind", () => {
    expect(resolveFurnitureBonuses(createInitialHomeLayout())).toEqual({
      restRecovery: FURNITURE_BONUS_CAP,
      studyGain: FURNITURE_BONUS_CAP,
    });
  });

  it("does not invent a benefit for a missing furniture kind", () => {
    const layout = createInitialHomeLayout();
    const withoutDesk = {
      ...layout,
      furniture: layout.furniture.filter(({ kind }) => kind !== "desk"),
    };

    expect(resolveFurnitureBonuses(withoutDesk)).toEqual({
      restRecovery: FURNITURE_BONUS_CAP,
      studyGain: 0,
    });
  });
});
