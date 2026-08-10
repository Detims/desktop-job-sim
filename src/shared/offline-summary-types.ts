import type { NeedState } from "./pet-types.js";

export interface OfflineItemSummary {
  count: number;
  itemId: string;
  name: string;
}

export interface OfflineReturnSummary {
  blocked: readonly string[];
  coinsEarned: number;
  coinsSpent: number;
  elapsedMs: number;
  generalXpEarned: number;
  generatedAt: number;
  illness: "recovered" | "started" | null;
  itemsPurchased: readonly OfflineItemSummary[];
  itemsUsed: readonly OfflineItemSummary[];
  jobsCompleted: number;
  masteryEarned: number;
  needsAfter: NeedState;
  needsBefore: NeedState;
  restsCompleted: number;
  shouldShow: boolean;
}

export interface OfflineReconciliationDiagnostic {
  code: string;
  context: Readonly<Record<string, boolean | number | string>>;
}
