import { describe, expect, it } from "vitest";

import type { OfflineReturnSummary } from "../../shared/offline-summary-types.js";
import { offlineSummaryLines } from "./pet-overlay.js";

describe("offline return summary", () => {
  it("formats aggregated actions, rewards, and blocked decisions", () => {
    const summary: OfflineReturnSummary = {
      blocked: ["No safe action."],
      coinsEarned: 12,
      coinsSpent: 3,
      elapsedMs: 120_000,
      generalXpEarned: 5,
      generatedAt: 120_000,
      illness: null,
      itemsPurchased: [{ count: 1, itemId: "core:water", name: "Water" }],
      itemsUsed: [{ count: 2, itemId: "core:water", name: "Water" }],
      jobsCompleted: 2,
      masteryEarned: 2.5,
      needsAfter: { energy: 90, hunger: 70, mood: 80, thirst: 60 },
      needsBefore: { energy: 80, hunger: 75, mood: 80, thirst: 40 },
      restsCompleted: 1,
      shouldShow: true,
    };

    expect(offlineSummaryLines(summary)).toEqual(expect.arrayContaining([
      "Away for 2 minutes.",
      "Used: Water x2",
      "Purchased: Water x1",
      "Activities: 2 job(s), 1 Rest session(s).",
      "Blocked: No safe action.",
    ]));
  });
});
