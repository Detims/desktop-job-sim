import type { PetState } from "../shared/pet-types.js";
import {
  applyOfflineNeedDecay,
  cancelActiveActivity,
  MAX_OFFLINE_ELAPSED_MS,
} from "../simulation/pet-simulation.js";

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
  diagnostics: readonly RecoveryDiagnostic[];
  offlineElapsedMs: number;
  state: PetState;
}

export function recoverPetState(
  persistedState: PetState,
  savedAt: number,
  now: number,
  cleanExit: boolean,
): RecoveryResult {
  const diagnostics: RecoveryDiagnostic[] = [];
  const rawElapsedMs = now - savedAt;
  let offlineElapsedMs = 0;

  if (!Number.isFinite(rawElapsedMs) || rawElapsedMs < 0) {
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
  let state = applyOfflineNeedDecay(
    cancelledState,
    offlineElapsedMs,
    now,
  );
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

  return { diagnostics, offlineElapsedMs, state };
}
