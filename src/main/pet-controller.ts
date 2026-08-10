import { SequentialCommandQueue } from "../domain/command-queue.js";
import {
  careerEventDrafts,
  careerMemoryDrafts,
  enrollCareer,
  promoteCareer,
} from "../domain/career.js";
import { attemptExam, reconcileTimedState } from "../domain/exam.js";
import {
  type ActivityBonuses,
  type PetCommand,
  type PetMutableState,
  type PetPatch,
  type PetSnapshot,
  type PetState,
} from "../shared/contracts.js";
import {
  advancePetState,
  cancelActiveActivity,
  createInitialPetState,
  startCareerJob,
  startJob,
  startPrototypePlay,
  startPrototypeRest,
  startStudy,
} from "../simulation/pet-simulation.js";
import { NO_ACTIVITY_BONUSES } from "../domain/furniture-bonuses.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";
import type { MemoryEntryDraft } from "../shared/memory-types.js";
import {
  comfortPet,
  purchaseCareItem,
  useCareItem,
} from "../domain/care.js";
import { getCareItem } from "../domain/care-items.js";
import { petRelationship, talkToPet } from "../domain/relationship.js";
import { BURNOUT_CONDITION_ID } from "../domain/burnout.js";
import {
  grantGeneralXp,
  INTENTIONAL_ACTION_XP,
  personalGrowthEventDrafts,
  personalGrowthMemoryDrafts,
} from "../domain/personal-growth.js";
import {
  evaluateAutonomy,
  type AutonomyDecision,
  type AutonomyPolicy,
} from "../domain/autonomy.js";
import { PROTOTYPE_JOB } from "../simulation/pet-simulation.js";

function relationshipMilestoneMemory(
  prior: PetState,
  next: PetState,
): MemoryEntryDraft | undefined {
  if (
    prior.relationship.growingCloserRecorded ||
    !next.relationship.growingCloserRecorded
  ) {
    return undefined;
  }
  return {
    category: "relationship",
    description: "Built a lasting bond through time, play, conversation, comfort, and thoughtful gifts.",
    petId: next.petId,
    title: "Growing Closer",
  };
}

function relationshipMilestoneEvent(
  prior: PetState,
  next: PetState,
): MeaningfulEventDraft | undefined {
  if (
    prior.relationship.growingCloserRecorded ||
    !next.relationship.growingCloserRecorded
  ) {
    return undefined;
  }
  return {
    details: { bond: next.relationship.bond },
    petId: next.petId,
    summary: "Reached the Growing Closer Bond milestone.",
    type: "relationship.milestone",
  };
}

type PatchListener = (patch: PetPatch) => void;
type DurableCommit = (
  state: PetState,
  now: number,
  events?: readonly MeaningfulEventDraft[],
  memories?: readonly MemoryEntryDraft[],
) => void;

export class PetController {
  private readonly commandQueue = new SequentialCommandQueue();
  private readonly listeners = new Set<PatchListener>();
  private state: PetState;
  private passiveNeedMultiplier = 1;
  private autonomyPolicy: AutonomyPolicy = { mode: "manual", reserveCoins: 10 };
  private lastAutonomyBlockedKey: string | null = null;

  constructor(
    initial: number | PetState,
    private readonly durableCommit?: DurableCommit,
    private activityBonuses: ActivityBonuses = NO_ACTIVITY_BONUSES,
  ) {
    this.state =
      typeof initial === "number"
        ? createInitialPetState(initial)
        : structuredClone(initial);
  }

  setActivityBonuses(bonuses: ActivityBonuses): void {
    this.activityBonuses = { ...bonuses };
  }

  setPassiveNeedMultiplier(multiplier: number): void {
    this.passiveNeedMultiplier = Math.max(0, multiplier);
  }

  setAutonomyPolicy(policy: AutonomyPolicy): void {
    this.autonomyPolicy = {
      mode: policy.mode,
      reserveCoins: Math.min(1_000, Math.max(0, Math.trunc(policy.reserveCoins))),
    };
    this.lastAutonomyBlockedKey = null;
  }

  getSnapshot(): PetSnapshot {
    return {
      state: structuredClone(this.state),
    };
  }

  subscribe(listener: PatchListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  tick(elapsedMs: number, now: number): PetSnapshot {
    const priorState = this.state;
    const priorActivity = this.state.activity;
    const priorIllness = this.state.care.seriousIllness;
    const priorBurnout = this.state.conditions[BURNOUT_CONDITION_ID];
    const next = advancePetState(
      this.state,
      elapsedMs,
      now,
      this.passiveNeedMultiplier,
    );
    const events = careerEventDrafts(priorState, next);
    const illnessStarted =
      priorIllness === null && next.care.seriousIllness !== null;
    const illnessRecovered =
      priorIllness !== null && next.care.seriousIllness === null;
    const burnoutStarted =
      priorBurnout === undefined &&
      next.conditions[BURNOUT_CONDITION_ID] !== undefined;
    const burnoutRecovered =
      priorBurnout !== undefined &&
      next.conditions[BURNOUT_CONDITION_ID] === undefined;
    const relationshipMemory = relationshipMilestoneMemory(priorState, next);
    const relationshipEvent = relationshipMilestoneEvent(priorState, next);
    if (priorActivity !== null && next.activity === null) {
      events.unshift({
            details: {
              activityType: priorActivity.type,
              definitionId: priorActivity.definitionId,
            },
            petId: this.state.petId,
            summary: illnessStarted
              ? `${priorActivity.type} stopped by Serious Illness; partial progress kept.`
              : burnoutStarted && next.statusText.includes("stopped")
                ? `${priorActivity.type} stopped by Burnout; partial progress kept.`
              : `${priorActivity.type} completed.`,
            type:
              illnessStarted ||
              (burnoutStarted && next.statusText.includes("stopped"))
                ? "activity.cancelled"
                : "activity.completed",
          });
    }
    if (illnessStarted) {
      events.push({
        details: { health: next.care.health },
        petId: next.petId,
        summary: "Serious Illness began.",
        type: "care.serious_illness",
      });
    }
    if (illnessRecovered) {
      events.push({
        details: { health: next.care.health },
        petId: next.petId,
        summary: "Recovered from Serious Illness.",
        type: "care.recovered",
      });
    }
    if (burnoutStarted) {
      events.push({
        details: {
          exposureMs: next.care.overworkExposureMs,
          expiresAt: next.conditions[BURNOUT_CONDITION_ID]!.expiresAt,
        },
        petId: next.petId,
        summary: "Burnout began.",
        type: "care.burnout_started",
      });
    }
    if (burnoutRecovered) {
      events.push({
        details: { protectedUntil: next.care.burnoutProtectedUntil },
        petId: next.petId,
        summary: "Recovered from Burnout.",
        type: "care.burnout_recovered",
      });
    }
    if (relationshipEvent !== undefined) events.push(relationshipEvent);
    this.commit(
      next,
      events.length > 0 ? now : undefined,
      events,
      [
        ...(illnessRecovered
          ? [{
            category: "illness",
            description: "Recovered from a Serious Illness and returned to ordinary life.",
            petId: next.petId,
            title: "Recovered from Serious Illness",
          } satisfies MemoryEntryDraft]
          : []),
        ...(relationshipMemory === undefined ? [] : [relationshipMemory]),
      ],
    );
    this.runAutonomy(now);
    return this.getSnapshot();
  }

  dispatch(command: PetCommand, now: number): Promise<PetSnapshot> {
    return this.commandQueue.enqueue(() => {
      switch (command.type) {
        case "comfort": {
          const next = grantGeneralXp(
            comfortPet(this.state, now),
            INTENTIONAL_ACTION_XP,
          );
          const memory = relationshipMilestoneMemory(this.state, next);
          const milestoneEvent = relationshipMilestoneEvent(this.state, next);
          this.commit(next, now, [{
            details: { mood: next.needs.mood, stress: next.care.stress },
            petId: next.petId,
            summary: "Comforted the pet.",
            type: "relationship.comforted",
          }, ...(milestoneEvent === undefined ? [] : [milestoneEvent])], memory === undefined ? undefined : [memory]);
          break;
        }
        case "attemptExam": {
          const resolution = attemptExam(this.state, command.examId, now);
          const passed = resolution.outcome !== "failed";
          this.commit(
            resolution.state,
            now,
            [{
              details: {
                examId: resolution.definition.id,
                outcome: resolution.outcome,
                qualificationId: resolution.definition.qualificationId,
              },
              petId: this.state.petId,
              summary: passed
                ? `Passed ${resolution.definition.name}.`
                : `${resolution.definition.name} attempt was unsuccessful.`,
              type: passed ? "exam.passed" : "exam.failed",
            }],
            passed
              ? [{
                  category: "qualification",
                  description: `Passed ${resolution.definition.name} and unlocked the Administrative Assistant career.`,
                  petId: this.state.petId,
                  title: "Administrative Assistant Certified",
                }]
              : undefined,
          );
          break;
        }
        case "cancelActivity":
          this.commit(
            cancelActiveActivity(this.state),
            now,
            this.state.activity === null
              ? undefined
              : [{
                  details: {
                    accumulatedMs: this.state.activity.accumulatedMs,
                    activityType: this.state.activity.type,
                    definitionId: this.state.activity.definitionId,
                  },
                  petId: this.state.petId,
                  summary: `${this.state.activity.type} cancelled; partial progress kept.`,
                  type: "activity.cancelled",
                }],
          );
          break;
        case "enrollCareer": {
          const next = enrollCareer(this.state, command.careerId, now);
          this.commit(next, now, careerEventDrafts(this.state, next));
          break;
        }
        case "pet": {
          const related = petRelationship(this.state, now);
          const next = grantGeneralXp({
            ...related,
            needs: {
              ...related.needs,
              mood: Math.min(100, related.needs.mood + 3),
            },
            presentation:
              related.care.seriousIllness === null ? "petted" as const : "ill" as const,
            presentationUntil:
              related.care.seriousIllness === null ? now + 900 : null,
            statusText: "Purr!",
          }, INTENTIONAL_ACTION_XP);
          const memory = relationshipMilestoneMemory(this.state, next);
          const milestoneEvent = relationshipMilestoneEvent(this.state, next);
          this.commit(
            next,
            now,
            [{
              details: { affection: next.relationship.affection, bond: next.relationship.bond },
              petId: next.petId,
              summary: "Petted the pet.",
              type: "relationship.petted",
            }, ...(milestoneEvent === undefined ? [] : [milestoneEvent])],
            memory === undefined ? undefined : [memory],
          );
          break;
        }
        case "purchaseItem": {
          const item = getCareItem(command.itemId);
          const next = purchaseCareItem(this.state, command.itemId);
          this.commit(next, now, [{
            details: { itemId: item.id, price: item.price },
            petId: next.petId,
            summary: `Purchased ${item.name}.`,
            type: "care.item_purchased",
          }]);
          break;
        }
        case "startJob": {
          const next = startJob(this.state, now, command.jobId);
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "job"
              ? [this.startEvent("job", next.activity.definitionId)]
              : undefined,
          );
          break;
        }
        case "startRest": {
          const next = startPrototypeRest(
            this.state,
            now,
            this.activityBonuses,
          );
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "rest"
              ? [this.startEvent("rest", next.activity.definitionId)]
              : undefined,
          );
          break;
        }
        case "startStudy": {
          const next = startStudy(
            reconcileTimedState(this.state, now),
            now,
            this.activityBonuses,
            command.studyId,
          );
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "study"
              ? [this.startEvent("study", next.activity.definitionId)]
              : undefined,
          );
          break;
        }
        case "startPlay": {
          const next = startPrototypePlay(this.state, now);
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "play"
              ? [this.startEvent("play", next.activity.definitionId)]
              : undefined,
          );
          break;
        }
        case "useItem": {
          const item = getCareItem(command.itemId);
          const next = grantGeneralXp(
            useCareItem(this.state, command.itemId, now),
            item.generalXpReward,
          );
          const memory = relationshipMilestoneMemory(this.state, next);
          const milestoneEvent = relationshipMilestoneEvent(this.state, next);
          this.commit(next, now, [{
            details: { itemId: item.id },
            petId: next.petId,
            summary: item.action === "gift" ? `Gave ${item.name}.` : `Used ${item.name}.`,
            type: item.action === "gift" ? "relationship.gifted" : "care.item_used",
          }, ...(milestoneEvent === undefined ? [] : [milestoneEvent])], memory === undefined ? undefined : [memory]);
          break;
        }
        case "talk": {
          const next = grantGeneralXp(
            talkToPet(this.state, now),
            INTENTIONAL_ACTION_XP,
          );
          const memory = relationshipMilestoneMemory(this.state, next);
          const milestoneEvent = relationshipMilestoneEvent(this.state, next);
          this.commit(next, now, [{
            details: { affection: next.relationship.affection, bond: next.relationship.bond },
            petId: next.petId,
            summary: "Talked with the pet.",
            type: "relationship.talked",
          }, ...(milestoneEvent === undefined ? [] : [milestoneEvent])], memory === undefined ? undefined : [memory]);
          break;
        }
        case "promoteCareer": {
          const next = promoteCareer(this.state, command.careerId);
          this.commit(
            next,
            now,
            careerEventDrafts(this.state, next),
            careerMemoryDrafts(this.state, next),
          );
          break;
        }
        case "startCareerJob": {
          const next = startCareerJob(this.state, now, command.jobId);
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "careerJob"
              ? [this.startEvent("careerJob", next.activity.definitionId)]
              : undefined,
          );
          break;
        }
        case "walk":
          if (
            this.state.activity === null &&
            this.state.care.seriousIllness === null
          ) {
            this.commit(
              {
                ...this.state,
                presentation: "walking",
                presentationUntil: now + 2500,
                statusText: "Taking a tiny walk.",
              },
              now,
            );
          }
          break;
      }

      this.runAutonomy(now);
      return this.getSnapshot();
    });
  }

  settleForCleanShutdown(elapsedMs: number, now: number): PetSnapshot {
    this.commit(
      advancePetState(this.state, elapsedMs, now, this.passiveNeedMultiplier),
    );
    this.commit(cancelActiveActivity(this.state));
    return this.getSnapshot();
  }

  settleForInterruption(elapsedMs: number, now: number): PetSnapshot {
    this.commit(
      advancePetState(this.state, elapsedMs, now, this.passiveNeedMultiplier),
    );
    this.commit(cancelActiveActivity(this.state));
    return this.getSnapshot();
  }

  private startEvent(
    activityType: "careerJob" | "job" | "play" | "rest" | "study",
    definitionId: string,
  ): MeaningfulEventDraft {
    return {
      details: { activityType, definitionId },
      petId: this.state.petId,
      summary: `${activityType} started.`,
      type: "activity.started",
    };
  }

  private runAutonomy(now: number): void {
    const decision = evaluateAutonomy(
      this.state,
      this.autonomyPolicy,
      PROTOTYPE_JOB,
    );
    if (decision === null) {
      this.lastAutonomyBlockedKey = null;
      return;
    }

    if (decision.type === "blocked") {
      const key = `${this.autonomyPolicy.mode}:${decision.code}:${decision.trigger}`;
      if (key === this.lastAutonomyBlockedKey) return;
      this.lastAutonomyBlockedKey = key;
      this.commit(
        { ...this.state, statusText: decision.message, updatedAt: now },
        now,
        [this.autonomyEvent(decision)],
      );
      return;
    }

    this.lastAutonomyBlockedKey = null;
    let next: PetState;
    switch (decision.type) {
      case "cancelActivity":
        next = cancelActiveActivity(this.state);
        break;
      case "purchaseItem":
        next = purchaseCareItem(this.state, decision.itemId);
        break;
      case "startJob":
        next = startJob(this.state, now, decision.jobId);
        break;
      case "startRest":
        next = startPrototypeRest(this.state, now, this.activityBonuses);
        break;
      case "useItem": {
        const item = getCareItem(decision.itemId);
        next = grantGeneralXp(
          useCareItem(this.state, decision.itemId, now),
          item.generalXpReward,
        );
        break;
      }
    }
    this.commit(
      { ...next, updatedAt: now },
      now,
      [this.autonomyEvent(decision)],
    );
  }

  private autonomyEvent(decision: AutonomyDecision): MeaningfulEventDraft {
    const details: Record<string, boolean | number | string | null> = {
      action: decision.type,
      energy: this.state.needs.energy,
      health: this.state.care.health,
      hunger: this.state.needs.hunger,
      hygiene: this.state.care.hygiene,
      mode: this.autonomyPolicy.mode,
      reserveCoins: this.autonomyPolicy.reserveCoins,
      thirst: this.state.needs.thirst,
      trigger: decision.trigger,
      wallet: this.state.household.wallet,
    };
    if ("itemId" in decision) details.itemId = decision.itemId;
    if ("jobId" in decision) details.jobId = decision.jobId;
    if ("reason" in decision) details.reason = decision.reason;
    if (decision.type === "purchaseItem") details.emergency = decision.emergency;
    if (decision.type === "blocked") details.code = decision.code;

    const summary = decision.type === "blocked"
      ? decision.message
      : decision.type === "cancelActivity"
        ? `Autonomy stopped an unsafe activity; partial progress was kept.`
        : decision.type === "startRest"
          ? "Autonomy started Rest for low energy."
          : decision.type === "startJob"
            ? "Autonomy started safe subsistence work for essential funds."
            : decision.type === "purchaseItem"
              ? `Autonomy purchased ${getCareItem(decision.itemId).name}.`
              : `Autonomy used ${getCareItem(decision.itemId).name}.`;
    return {
      details,
      petId: this.state.petId,
      summary,
      type: decision.type === "blocked" ? "autonomy.blocked" : "autonomy.action",
    };
  }

  private commit(
    nextState: PetState,
    durableAt?: number,
    events?: readonly MeaningfulEventDraft[],
    memories?: readonly MemoryEntryDraft[],
  ): void {
    if (nextState === this.state) {
      return;
    }

    const progressionEvents = personalGrowthEventDrafts(this.state, nextState);
    const progressionMemories = personalGrowthMemoryDrafts(this.state, nextState);
    const committedEvents = [...(events ?? []), ...progressionEvents];
    const committedMemories = [...(memories ?? []), ...progressionMemories];
    const effectiveDurableAt =
      durableAt ?? (progressionEvents.length > 0 ? nextState.updatedAt : undefined);
    const baseVersion = this.state.stateVersion;
    const nextVersion = baseVersion + 1;
    const changes: PetMutableState = {
      activity: nextState.activity,
      care: nextState.care,
      careers: nextState.careers,
      conditions: nextState.conditions,
      examCooldowns: nextState.examCooldowns,
      generalXp: nextState.generalXp,
      knowledge: nextState.knowledge,
      mastery: nextState.mastery,
      needs: nextState.needs,
      presentation: nextState.presentation,
      presentationUntil: nextState.presentationUntil,
      randomSeed: nextState.randomSeed,
      qualifications: nextState.qualifications,
      relationship: nextState.relationship,
      statusText: nextState.statusText,
      updatedAt: nextState.updatedAt,
      household: nextState.household,
    };

    const committedState: PetState = {
      ...nextState,
      stateVersion: nextVersion,
    };

    if (effectiveDurableAt !== undefined) {
      this.durableCommit?.(
        committedState,
        effectiveDurableAt,
        committedEvents,
        committedMemories,
      );
    }

    this.state = committedState;

    const patch: PetPatch = {
      baseVersion,
      changes,
      nextVersion,
    };

    for (const listener of this.listeners) {
      listener(structuredClone(patch));
    }
  }
}
