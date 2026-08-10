import {
  evaluateAutonomy,
  type AutonomyPolicy,
} from "../domain/autonomy.js";
import { BURNOUT_CONDITION_ID } from "../domain/burnout.js";
import { purchaseCareItem, useCareItem, HYGIENE_DECAY_PER_HOUR } from "../domain/care.js";
import { getCareItem } from "../domain/care-items.js";
import { grantGeneralXp } from "../domain/personal-growth.js";
import { reconcileTimedState } from "../domain/exam.js";
import type { ActivityBonuses, JobDefinition, PetState, RestDefinition } from "../shared/pet-types.js";
import type {
  OfflineItemSummary,
  OfflineReconciliationDiagnostic,
  OfflineReturnSummary,
} from "../shared/offline-summary-types.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";
import {
  advancePetState,
  applyOfflineNeedDecay,
  cancelActiveActivity,
  NEED_DECAY_PER_HOUR,
  PROTOTYPE_JOB,
  PROTOTYPE_REST,
  PROTOTYPE_STUDY,
  startPrototypeJob,
  startPrototypeRest,
} from "../simulation/pet-simulation.js";

const HOUR_MS = 60 * 60 * 1_000;
const MAX_RECONCILIATION_STEPS = 1_000;

export interface OfflineAutonomyPolicy extends AutonomyPolicy {
  activityBonuses: ActivityBonuses;
  enabled: boolean;
  rewardMultiplier: number;
}

export interface OfflineAutonomyResult {
  diagnostics: readonly OfflineReconciliationDiagnostic[];
  state: PetState;
  summary: OfflineReturnSummary;
}

interface MutableTotals {
  blocked: string[];
  itemsPurchased: Map<string, number>;
  itemsUsed: Map<string, number>;
  jobsCompleted: number;
  restsCompleted: number;
}

function scaledJob(multiplier: number): JobDefinition {
  return {
    ...PROTOTYPE_JOB,
    completionMasteryBonus: PROTOTYPE_JOB.completionMasteryBonus * multiplier,
    rewardCoins: PROTOTYPE_JOB.rewardCoins * multiplier,
    rewardGeneralXp: PROTOTYPE_JOB.rewardGeneralXp * multiplier,
    rewardMastery: PROTOTYPE_JOB.rewardMastery * multiplier,
  };
}

function scaledRest(multiplier: number): RestDefinition {
  return {
    ...PROTOTYPE_REST,
    rewardGeneralXp: PROTOTYPE_REST.rewardGeneralXp * multiplier,
  };
}

function timeUntilThreshold(
  value: number,
  threshold: number,
  decayPerHour: number,
  rate: number,
): number {
  const effectiveDecay = decayPerHour * rate;
  if (value <= threshold || effectiveDecay <= 0) return value <= threshold ? 0 : Number.POSITIVE_INFINITY;
  return ((value - threshold) / effectiveDecay) * HOUR_MS;
}

function nextPassiveEventMs(state: PetState, rate: number, now: number): number {
  const candidates = [
    timeUntilThreshold(state.needs.thirst, 25, NEED_DECAY_PER_HOUR.thirst, rate),
    timeUntilThreshold(state.needs.thirst, 10, NEED_DECAY_PER_HOUR.thirst, rate),
    timeUntilThreshold(state.needs.hunger, 25, NEED_DECAY_PER_HOUR.hunger, rate),
    timeUntilThreshold(state.needs.hunger, 10, NEED_DECAY_PER_HOUR.hunger, rate),
    timeUntilThreshold(state.needs.energy, 20, NEED_DECAY_PER_HOUR.energy, rate),
    timeUntilThreshold(state.needs.energy, 10, NEED_DECAY_PER_HOUR.energy, rate),
    timeUntilThreshold(state.care.hygiene, 25 - 1e-7, HYGIENE_DECAY_PER_HOUR, rate),
    timeUntilThreshold(state.care.hygiene, 10, HYGIENE_DECAY_PER_HOUR, rate),
  ];
  const illnessRecovery = state.care.seriousIllness?.recoverAt;
  if (illnessRecovery !== undefined) candidates.push(Math.max(0, illnessRecovery - now));
  const burnoutRecovery = state.conditions[BURNOUT_CONDITION_ID]?.expiresAt;
  if (burnoutRecovery !== undefined) candidates.push(Math.max(0, burnoutRecovery - now));
  return Math.min(...candidates.filter((candidate) => candidate > 1e-6));
}

function suppressNewIllness(before: PetState, after: PetState): PetState {
  if (before.care.seriousIllness !== null || after.care.seriousIllness === null) return after;
  return {
    ...after,
    care: { ...after.care, seriousIllness: null },
    presentation: before.activity === null ? "idle" : before.presentation,
    presentationUntil: null,
  };
}

function advanceIdle(
  state: PetState,
  elapsedMs: number,
  now: number,
  rate: number,
): PetState {
  return reconcileTimedState(suppressNewIllness(
    state,
    applyOfflineNeedDecay(state, elapsedMs, now, rate),
  ), now);
}

function advanceRestToStop(
  state: PetState,
  remainingMs: number,
  now: number,
  rate: number,
  job: JobDefinition,
  rest: RestDefinition,
): { elapsedMs: number; state: PetState } {
  const maximum = Math.min(remainingMs, rest.durationMs);
  const atMaximum = advancePetState(state, maximum, now + maximum, rate, job, PROTOTYPE_STUDY, rest);
  if (atMaximum.activity !== null || maximum <= 1) {
    return { elapsedMs: maximum, state: atMaximum };
  }
  let low = 0;
  let high = Math.ceil(maximum);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = advancePetState(state, middle, now + middle, rate, job, PROTOTYPE_STUDY, rest);
    if (candidate.activity === null) high = middle;
    else low = middle;
  }
  return {
    elapsedMs: high,
    state: advancePetState(state, high, now + high, rate, job, PROTOTYPE_STUDY, rest),
  };
}

function itemSummaries(counts: ReadonlyMap<string, number>): OfflineItemSummary[] {
  return [...counts.entries()]
    .map(([itemId, count]) => ({ count, itemId, name: getCareItem(itemId).name }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function increment(counts: Map<string, number>, itemId: string): void {
  counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
}

export function reconcileOfflineAutonomy(
  initialState: PetState,
  elapsedMs: number,
  startedAt: number,
  onlineNeedMultiplier: number,
  policy: OfflineAutonomyPolicy,
): OfflineAutonomyResult {
  const totalElapsedMs = Math.max(0, elapsedMs);
  const passiveRate = Math.max(0, onlineNeedMultiplier) * 0.5;
  const before = structuredClone(initialState);
  const initialIllness = before.care.seriousIllness;
  const totals: MutableTotals = {
    blocked: [],
    itemsPurchased: new Map(),
    itemsUsed: new Map(),
    jobsCompleted: 0,
    restsCompleted: 0,
  };
  const diagnostics: OfflineReconciliationDiagnostic[] = [];
  const job = scaledJob(policy.rewardMultiplier);
  const rest = scaledRest(policy.rewardMultiplier);
  let state = structuredClone(initialState);
  let cursor = 0;
  let steps = 0;

  const autonomyActive = policy.enabled && policy.mode !== "manual";
  while (autonomyActive && cursor < totalElapsedMs) {
    steps += 1;
    if (steps > MAX_RECONCILIATION_STEPS) {
      throw new Error("Offline autonomy exceeded its deterministic step limit.");
    }
    const now = startedAt + cursor;
    const decision = evaluateAutonomy(state, policy, job);
    if (decision !== null) {
      diagnostics.push({
        code: `offline.${decision.type}`,
        context: {
          action: decision.type,
          elapsedMs: cursor,
          trigger: decision.trigger,
          wallet: state.household.wallet,
        },
      });
      if (decision.type === "blocked") {
        if (!totals.blocked.includes(decision.message)) totals.blocked.push(decision.message);
        const recoveryAt = state.care.seriousIllness?.recoverAt;
        if (recoveryAt !== undefined && recoveryAt > now && recoveryAt < startedAt + totalElapsedMs) {
          const advanceMs = recoveryAt - now;
          state = advanceIdle(state, advanceMs, recoveryAt, passiveRate);
          cursor += advanceMs;
          continue;
        }
        break;
      }
      if (decision.type === "cancelActivity") {
        state = cancelActiveActivity(state);
        continue;
      }
      if (decision.type === "purchaseItem") {
        state = { ...purchaseCareItem(state, decision.itemId), updatedAt: now };
        increment(totals.itemsPurchased, decision.itemId);
        continue;
      }
      if (decision.type === "useItem") {
        const item = getCareItem(decision.itemId);
        state = grantGeneralXp(
          { ...useCareItem(state, decision.itemId, now), updatedAt: now },
          item.generalXpReward * policy.rewardMultiplier,
        );
        increment(totals.itemsUsed, decision.itemId);
        continue;
      }
      if (decision.type === "startJob") {
        if (policy.rewardMultiplier === 0 || totalElapsedMs - cursor < job.durationMs) {
          const message = policy.rewardMultiplier === 0
            ? "Offline work rewards are disabled."
            : "Not enough offline time remained for safe subsistence work.";
          if (!totals.blocked.includes(message)) totals.blocked.push(message);
          diagnostics.push({ code: "offline.job_blocked", context: { elapsedMs: cursor, reason: message } });
          break;
        }
        const working = startPrototypeJob(state, now, job);
        state = suppressNewIllness(
          working,
          advancePetState(working, job.durationMs, now + job.durationMs, passiveRate, job),
        );
        cursor += job.durationMs;
        totals.jobsCompleted += 1;
        continue;
      }
      const resting = startPrototypeRest(state, now, policy.activityBonuses, rest);
      const advanced = advanceRestToStop(
        resting,
        totalElapsedMs - cursor,
        now,
        passiveRate,
        job,
        rest,
      );
      state = suppressNewIllness(resting, advanced.state);
      cursor += advanced.elapsedMs;
      if (state.activity === null) totals.restsCompleted += 1;
      else state = cancelActiveActivity(state);
      continue;
    }

    const nextEventMs = nextPassiveEventMs(state, passiveRate, now);
    const advanceMs = Math.min(totalElapsedMs - cursor, nextEventMs);
    if (!Number.isFinite(advanceMs) || advanceMs <= 1e-6) break;
    state = advanceIdle(state, advanceMs, now + advanceMs, passiveRate);
    cursor += advanceMs;
  }

  if (cursor < totalElapsedMs) {
    state = advanceIdle(
      state,
      totalElapsedMs - cursor,
      startedAt + totalElapsedMs,
      passiveRate,
    );
  }
  state = applyOfflineNeedDecay(state, 0, startedAt + totalElapsedMs, passiveRate);
  state = cancelActiveActivity(state);

  const itemsPurchased = itemSummaries(totals.itemsPurchased);
  const itemsUsed = itemSummaries(totals.itemsUsed);
  const autonomousDecisionOccurred =
    itemsPurchased.length > 0 ||
    itemsUsed.length > 0 ||
    totals.jobsCompleted > 0 ||
    totals.restsCompleted > 0 ||
    totals.blocked.length > 0;
  const summary: OfflineReturnSummary = {
    blocked: totals.blocked,
    coinsEarned: Math.max(0, state.household.wallet - before.household.wallet +
      itemsPurchased.reduce((sum, item) => sum + getCareItem(item.itemId).price * item.count, 0)),
    coinsSpent: itemsPurchased.reduce((sum, item) => sum + getCareItem(item.itemId).price * item.count, 0),
    elapsedMs: totalElapsedMs,
    generalXpEarned: Math.max(0, state.generalXp - before.generalXp),
    generatedAt: startedAt + totalElapsedMs,
    illness:
      initialIllness === null && state.care.seriousIllness !== null
        ? "started"
        : initialIllness !== null && state.care.seriousIllness === null
          ? "recovered"
          : null,
    itemsPurchased,
    itemsUsed,
    jobsCompleted: totals.jobsCompleted,
    masteryEarned: Math.max(0, state.mastery - before.mastery),
    needsAfter: structuredClone(state.needs),
    needsBefore: structuredClone(before.needs),
    restsCompleted: totals.restsCompleted,
    shouldShow: totalElapsedMs >= 60_000 || autonomousDecisionOccurred,
  };
  return { diagnostics, state, summary };
}

export function offlineSummaryEventDrafts(
  summary: OfflineReturnSummary,
  petId: string,
): MeaningfulEventDraft[] {
  if (!summary.shouldShow) return [];
  const events: MeaningfulEventDraft[] = [{
    details: {
      coinsEarned: summary.coinsEarned,
      coinsSpent: summary.coinsSpent,
      elapsedMs: summary.elapsedMs,
      generalXpEarned: summary.generalXpEarned,
      jobsCompleted: summary.jobsCompleted,
      masteryEarned: summary.masteryEarned,
      restsCompleted: summary.restsCompleted,
    },
    petId,
    summary: `Returned after ${Math.max(1, Math.round(summary.elapsedMs / 60_000))} minute(s) away.`,
    type: "offline.summary",
  }];
  for (const item of summary.itemsUsed) {
    events.push({
      details: { count: item.count, itemId: item.itemId },
      petId,
      summary: `Used ${item.name} x${item.count} while away.`,
      type: "offline.action",
    });
  }
  for (const item of summary.itemsPurchased) {
    events.push({
      details: { count: item.count, itemId: item.itemId },
      petId,
      summary: `Purchased ${item.name} x${item.count} while away.`,
      type: "offline.action",
    });
  }
  if (summary.jobsCompleted > 0) {
    events.push({
      details: { count: summary.jobsCompleted, coinsEarned: summary.coinsEarned },
      petId,
      summary: `Completed subsistence work x${summary.jobsCompleted} while away.`,
      type: "offline.action",
    });
  }
  if (summary.restsCompleted > 0) {
    events.push({
      details: { count: summary.restsCompleted },
      petId,
      summary: `Rested x${summary.restsCompleted} while away.`,
      type: "offline.action",
    });
  }
  for (const message of summary.blocked) {
    events.push({
      details: { reason: message },
      petId,
      summary: message,
      type: "offline.blocked",
    });
  }
  return events;
}
