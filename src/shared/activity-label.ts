import type { ActiveActivity } from "./pet-types.js";

export function activityLabel(activity: ActiveActivity): string {
  if (activity.type === "study") return "General Study";
  if (activity.type === "rest") return "Rest";
  return "Sort Tiny Files";
}
