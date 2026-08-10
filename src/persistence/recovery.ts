import type { PetState } from "../shared/pet-types.js";
import {
  cancelActiveActivity,
  MAX_OFFLINE_ELAPSED_MS,
} from "../simulation/pet-simulation.js";
import { reconcileTimedState } from "../domain/exam.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";
import type { OfflineReturnSummary } from "../shared/offline-summary-types.js";
import type { OfflineReconciliationDiagnostic } from "../shared/offline-summary-types.js";
import {
  offlineSummaryEventDrafts,
  reconcileOfflineAutonomy,
  type OfflineAutonomyPolicy,
} from "./offline-autonomy.js";

export type RecoveryDiagnosticCode =
  | "recovery.clean_start"
  | "recovery.crash_settled"
  | "recovery.invalid_clock"
  | "recovery.offline_capped";

export interface RecoveryDiagnostic {
  code: RecoveryDiagnosticCode;
  context?: Readonly<Record<string, boolean | number | string>>;
}

export interface RecoveryResult {
  burnoutRecovered: boolean;
  diagnostics: readonly RecoveryDiagnostic[];
  illnessRecovered: boolean;
  offlineDiagnostics: readonly OfflineReconciliationDiagnostic[];
  offlineEvents: readonly MeaningfulEventDraft[];
  offlineElapsedMs: number;
  returnSummary: OfflineReturnSummary;
  state: PetState;
}

const DEFAULT_OFFLINE_POLICY: OfflineAutonomyPolicy = {
  activityBonuses: { restRecovery: 0, studyGain: 0 },
  enabled: false,
  mode: "manual",
  reserveCoins: 10,
  rewardMultiplier: 0.5,
};

export function recoverPetState(
  persistedState: PetState,
  savedAt: number,
  now: number,
  cleanExit: boolean,
  onlineNeedMultiplier = 1,
  offlinePolicy: OfflineAutonomyPolicy = DEFAULT_OFFLINE_POLICY,
): RecoveryResult {
  const diagnostics: RecoveryDiagnostic[] = [];
  const rawElapsedMs = now - savedAt;
  const validClock = Number.isFinite(rawElapsedMs) && rawElapsedMs >= 0;
  let offlineElapsedMs = 0;

  if (!validClock) {
    diagnostics.push({
      code: "recovery.invalid_clock",
      context: { now, savedAt },
    });
  } else {
    offlineElapsedMs = Math.min(rawElapsedMs, MAX_OFFLINE_ELAPSED_MS);
    if (rawElapsedMs > MAX_OFFLINE_ELAPSED_MS) {
      diagnostics.push({
        code: "recovery.offline_capped",
        context: { appliedMs: offlineElapsedMs, requestedMs: rawElapsedMs },
      });
    }
  }

  const hadActiveActivity = persistedState.activity !== null;
  const cancelledState = cancelActiveActivity(persistedState);
  const effectiveNow = validClock ? now : savedAt;
  const offline = reconcileOfflineAutonomy(
    cancelledState,
    offlineElapsedMs,
    savedAt,
    onlineNeedMultiplier,
    offlinePolicy,
  );
  let state = offline.state;
  state = reconcileTimedState(state, effectiveNow);
  state = {
    ...state,
    stateVersion: state.stateVersion + 1,
  };

  if (!cleanExit || hadActiveActivity) {
    diagnostics.push({
      code: "recovery.crash_settled",
      context: { hadActiveActivity },
    });
  } else {
    diagnostics.push({ code: "recovery.clean_start" });
  }

  return {
    burnoutRecovered:
      persistedState.conditions["core:burnout"] !== undefined &&
      state.conditions["core:burnout"] === undefined,
    diagnostics,
    illnessRecovered:
      persistedState.care.seriousIllness !== null &&
      state.care.seriousIllness === null,
    offlineDiagnostics: offline.diagnostics,
    offlineEvents: offlineSummaryEventDrafts(offline.summary, state.petId),
    offlineElapsedMs,
    returnSummary: offline.summary,
    state,
  };
}
