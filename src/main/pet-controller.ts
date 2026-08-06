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
  startPrototypeJob,
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
    if (priorActivity !== null && next.activity === null) {
      events.unshift({
            details: {
              activityType: priorActivity.type,
              definitionId: priorActivity.definitionId,
            },
            petId: this.state.petId,
            summary: illnessStarted
              ? `${priorActivity.type} stopped by Serious Illness; partial progress kept.`
              : `${priorActivity.type} completed.`,
            type: illnessStarted ? "activity.cancelled" : "activity.completed",
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
    this.commit(
      next,
      events.length > 0 ? now : undefined,
      events,
      illnessRecovered
        ? [{
            category: "illness",
            description: "Recovered from a Serious Illness and returned to ordinary life.",
            petId: next.petId,
            title: "Recovered from Serious Illness",
          }]
        : undefined,
    );
    return this.getSnapshot();
  }

  dispatch(command: PetCommand, now: number): Promise<PetSnapshot> {
    return this.commandQueue.enqueue(() => {
      switch (command.type) {
        case "comfort": {
          const next = comfortPet(this.state, now);
          this.commit(next, now, [{
            details: { mood: next.needs.mood, stress: next.care.stress },
            petId: next.petId,
            summary: "Comforted the pet.",
            type: "care.comforted",
          }]);
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
        case "pet":
          this.commit(
            {
              ...this.state,
              needs: {
                ...this.state.needs,
                mood: Math.min(100, this.state.needs.mood + 3),
              },
              presentation: "petted",
              presentationUntil: now + 900,
              statusText: "Purr!",
            },
            now,
          );
          break;
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
          const next = startPrototypeJob(this.state, now);
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
        case "useItem": {
          const item = getCareItem(command.itemId);
          const next = useCareItem(this.state, command.itemId, now);
          this.commit(next, now, [{
            details: { itemId: item.id },
            petId: next.petId,
            summary: `Used ${item.name}.`,
            type: "care.item_used",
          }]);
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
    activityType: "careerJob" | "job" | "rest" | "study",
    definitionId: string,
  ): MeaningfulEventDraft {
    return {
      details: { activityType, definitionId },
      petId: this.state.petId,
      summary: `${activityType} started.`,
      type: "activity.started",
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

    const baseVersion = this.state.stateVersion;
    const nextVersion = baseVersion + 1;
    const changes: PetMutableState = {
      activity: nextState.activity,
      care: nextState.care,
      careers: nextState.careers,
      conditions: nextState.conditions,
      examCooldowns: nextState.examCooldowns,
      knowledge: nextState.knowledge,
      mastery: nextState.mastery,
      needs: nextState.needs,
      presentation: nextState.presentation,
      presentationUntil: nextState.presentationUntil,
      randomSeed: nextState.randomSeed,
      qualifications: nextState.qualifications,
      statusText: nextState.statusText,
      updatedAt: nextState.updatedAt,
      household: nextState.household,
    };

    const committedState: PetState = {
      ...nextState,
      stateVersion: nextVersion,
    };

    if (durableAt !== undefined) {
      this.durableCommit?.(committedState, durableAt, events, memories);
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
