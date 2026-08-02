import type { HomeLayout } from "../shared/home-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";

export interface HomeLayoutRepository {
  loadHomeLayout(): HomeLayout | null;
  saveHomeLayout(
    layout: HomeLayout,
    expectedVersion: number | null,
    event?: MeaningfulEvent,
  ): void;
}
