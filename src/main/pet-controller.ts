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

export class PetController {
  private readonly commandQueue = new SequentialCommandQueue();
  private readonly listeners = new Set<PatchListener>();
  private state: PetState;

  constructor(now: number) {
    this.state = createInitialPetState(now);
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

  tick(elapsedMs: number, now: number): void {
    this.commit(advancePetState(this.state, elapsedMs, now));
  }

  dispatch(command: PetCommand, now: number): Promise<PetSnapshot> {
    return this.commandQueue.enqueue(() => {
      switch (command.type) {
        case "cancelJob":
          this.commit(cancelActiveJob(this.state));
          break;
        case "pet":
          this.commit({
            ...this.state,
            needs: {
              ...this.state.needs,
              mood: Math.min(100, this.state.needs.mood + 3),
            },
            presentation: "petted",
            presentationUntil: now + 900,
            statusText: "Purr!",
          });
          break;
        case "startJob":
          this.commit(startPrototypeJob(this.state, now));
          break;
        case "walk":
          if (this.state.activity === null) {
            this.commit({
              ...this.state,
              presentation: "walking",
              presentationUntil: now + 2500,
              statusText: "Taking a tiny walk.",
            });
          }
          break;
      }

      return this.getSnapshot();
    });
  }

  private commit(nextState: PetState): void {
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

    this.state = {
      ...nextState,
      stateVersion: nextVersion,
    };

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

