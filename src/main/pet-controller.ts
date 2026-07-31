import { SequentialCommandQueue } from "../domain/command-queue.js";
import {
  type PetCommand,
  type PetMutableState,
  type PetPatch,
  type PetSnapshot,
  type PetState,
} from "../shared/contracts.js";
import {
  advancePetState,
  cancelActiveJob,
  createInitialPetState,
  startPrototypeJob,
} from "../simulation/pet-simulation.js";

type PatchListener = (patch: PetPatch) => void;
type DurableCommit = (state: PetState, now: number) => void;

export class PetController {
  private readonly commandQueue = new SequentialCommandQueue();
  private readonly listeners = new Set<PatchListener>();
  private state: PetState;

  constructor(
    initial: number | PetState,
    private readonly durableCommit?: DurableCommit,
  ) {
    this.state =
      typeof initial === "number"
        ? createInitialPetState(initial)
        : structuredClone(initial);
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
        case "cancelJob":
          this.commit(cancelActiveJob(this.state), now);
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
    this.commit(cancelActiveJob(this.state));
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
