import type { HomeLayout } from "../shared/home-types.js";

export interface HomeLayoutRepository {
  loadHomeLayout(): HomeLayout | null;
  saveHomeLayout(
    layout: HomeLayout,
    expectedVersion: number | null,
  ): void;
}
