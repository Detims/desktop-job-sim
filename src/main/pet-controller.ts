import { SequentialCommandQueue } from "../domain/command-queue.js";
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
  startPrototypeJob,
  startPrototypeRest,
  startPrototypeStudy,
} from "../simulation/pet-simulation.js";
import { NO_ACTIVITY_BONUSES } from "../domain/furniture-bonuses.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";

type PatchListener = (patch: PetPatch) => void;
type DurableCommit = (
  state: PetState,
  now: number,
  event?: MeaningfulEventDraft,
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
    const priorActivity = this.state.activity;
    const next = advancePetState(
      this.state,
      elapsedMs,
      now,
      this.passiveNeedMultiplier,
    );
    this.commit(
      next,
      priorActivity !== null && next.activity === null ? now : undefined,
      priorActivity !== null && next.activity === null
        ? {
            details: {
              activityType: priorActivity.type,
              definitionId: priorActivity.definitionId,
            },
            petId: this.state.petId,
            summary: `${priorActivity.type} completed.`,
            type: "activity.completed",
          }
        : undefined,
    );
    return this.getSnapshot();
  }

  dispatch(command: PetCommand, now: number): Promise<PetSnapshot> {
    return this.commandQueue.enqueue(() => {
      switch (command.type) {
        case "cancelActivity":
          this.commit(
            cancelActiveActivity(this.state),
            now,
            this.state.activity === null
              ? undefined
              : {
                  details: {
                    accumulatedMs: this.state.activity.accumulatedMs,
                    activityType: this.state.activity.type,
                    definitionId: this.state.activity.definitionId,
                  },
                  petId: this.state.petId,
                  summary: `${this.state.activity.type} cancelled; partial progress kept.`,
                  type: "activity.cancelled",
                },
          );
          break;
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
        case "startJob": {
          const next = startPrototypeJob(this.state, now);
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "job"
              ? this.startEvent("job", next.activity.definitionId)
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
              ? this.startEvent("rest", next.activity.definitionId)
              : undefined,
          );
          break;
        }
        case "startStudy": {
          const next = startPrototypeStudy(
            this.state,
            now,
            this.activityBonuses,
          );
          this.commit(
            next,
            now,
            this.state.activity === null && next.activity?.type === "study"
              ? this.startEvent("study", next.activity.definitionId)
              : undefined,
          );
          break;
        }
        case "walk":
          if (this.state.activity === null) {
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
    activityType: "job" | "rest" | "study",
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
    event?: MeaningfulEventDraft,
  ): void {
    if (nextState === this.state) {
      return;
    }

    const baseVersion = this.state.stateVersion;
    const nextVersion = baseVersion + 1;
    const changes: PetMutableState = {
      activity: nextState.activity,
      knowledge: nextState.knowledge,
      mastery: nextState.mastery,
      needs: nextState.needs,
      presentation: nextState.presentation,
      presentationUntil: nextState.presentationUntil,
      randomSeed: nextState.randomSeed,
      statusText: nextState.statusText,
      updatedAt: nextState.updatedAt,
      wallet: nextState.wallet,
    };

    const committedState: PetState = {
      ...nextState,
      stateVersion: nextVersion,
    };

    if (durableAt !== undefined) {
      this.durableCommit?.(committedState, durableAt, event);
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
