import type { ActiveActivity } from "./pet-types.js";

const CAREER_JOB_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "core:clerk:audit-records": "Audit Records",
  "core:clerk:organize-mail": "Organize Mail",
  "core:clerk:process-forms": "Process Forms",
});

export function activityLabel(activity: ActiveActivity): string {
  if (activity.type === "study") return "General Study";
  if (activity.type === "rest") return "Rest";
  if (activity.type === "careerJob") {
    return CAREER_JOB_LABELS[activity.definitionId] ?? "Career Work";
  }
  return "Sort Tiny Files";
}
