import type { PetState } from "../shared/pet-types.js";
import {
  applyOfflineNeedDecay,
  cancelActiveActivity,
  MAX_OFFLINE_ELAPSED_MS,
  OFFLINE_NEED_RATE,
} from "../simulation/pet-simulation.js";
import { reconcileTimedState } from "../domain/exam.js";

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
  offlineElapsedMs: number;
  state: PetState;
}

export function recoverPetState(
  persistedState: PetState,
  savedAt: number,
  now: number,
  cleanExit: boolean,
  onlineNeedMultiplier = 1,
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
  let state = applyOfflineNeedDecay(
    cancelledState,
    offlineElapsedMs,
    effectiveNow,
    onlineNeedMultiplier * OFFLINE_NEED_RATE,
  );
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
    offlineElapsedMs,
    state,
  };
}
