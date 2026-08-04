import type { ActiveActivity } from "./pet-types.js";

const CAREER_JOB_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "core:clerk:audit-records": "Audit Records",
  "core:clerk:organize-mail": "Organize Mail",
  "core:clerk:process-forms": "Process Forms",
  "core:administrative-assistant:schedule-coordination": "Schedule Coordination",
});
const STUDY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "core:business-fundamentals": "Business Fundamentals",
  "core:general-study": "General Study",
  "core:office-procedures": "Office Procedures",
});

export function activityLabel(activity: ActiveActivity): string {
  if (activity.type === "study") {
    return STUDY_LABELS[activity.definitionId] ?? "Study";
  }
  if (activity.type === "rest") return "Rest";
  if (activity.type === "careerJob") {
    return CAREER_JOB_LABELS[activity.definitionId] ?? "Career Work";
  }
  return "Sort Tiny Files";
}
