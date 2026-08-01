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

type PatchListener = (patch: PetPatch) => void;
type DurableCommit = (state: PetState, now: number) => void;

export class PetController {
  private readonly commandQueue = new SequentialCommandQueue();
  private readonly listeners = new Set<PatchListener>();
  private state: PetState;

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
    this.commit(advancePetState(this.state, elapsedMs, now));
    return this.getSnapshot();
  }

  dispatch(command: PetCommand, now: number): Promise<PetSnapshot> {
    return this.commandQueue.enqueue(() => {
      switch (command.type) {
        case "cancelActivity":
          this.commit(cancelActiveActivity(this.state), now);
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
        case "startJob":
          this.commit(startPrototypeJob(this.state, now), now);
          break;
        case "startRest":
          this.commit(
            startPrototypeRest(this.state, now, this.activityBonuses),
            now,
          );
          break;
        case "startStudy":
          this.commit(
            startPrototypeStudy(this.state, now, this.activityBonuses),
            now,
          );
          break;
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
    this.commit(advancePetState(this.state, elapsedMs, now));
    this.commit(cancelActiveActivity(this.state));
    return this.getSnapshot();
  }

  settleForInterruption(elapsedMs: number, now: number): PetSnapshot {
    this.commit(advancePetState(this.state, elapsedMs, now));
    this.commit(cancelActiveActivity(this.state));
    return this.getSnapshot();
  }

  private commit(nextState: PetState, durableAt?: number): void {
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
      this.durableCommit?.(committedState, durableAt);
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
