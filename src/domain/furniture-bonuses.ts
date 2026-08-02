import type { ActivityBonuses } from "../shared/pet-types.js";
import type { HomeLayout } from "../shared/home-types.js";

export const FURNITURE_BONUS_CAP = 0.05;

export const NO_ACTIVITY_BONUSES: Readonly<ActivityBonuses> = Object.freeze({
  restRecovery: 0,
  studyGain: 0,
});

export function resolveFurnitureBonuses(
  layout: HomeLayout,
): ActivityBonuses {
  const kinds = new Set(layout.furniture.map(({ kind }) => kind));
  return {
    restRecovery: kinds.has("bed") ? FURNITURE_BONUS_CAP : 0,
    studyGain: kinds.has("desk") ? FURNITURE_BONUS_CAP : 0,
  };
}
