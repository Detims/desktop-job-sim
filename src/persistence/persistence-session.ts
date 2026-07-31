import type {
  PetState,
  WindowPoint,
} from "../shared/pet-types.js";
import type { PetRepository } from "./pet-repository.js";

export const WORK_CHECKPOINT_INTERVAL_MS = 5_000;

export class PersistenceSession {
  private lastPersistedActivityMs: number | null;

  constructor(
    private readonly repository: PetRepository,
    private position: WindowPoint,
    initialState: PetState,
  ) {
    this.lastPersistedActivityMs =
      initialState.activity?.accumulatedMs ?? null;
  }

  close(): void {
    this.repository.close();
  }

  getPosition(): WindowPoint {
    return { ...this.position };
  }

  maybeCheckpoint(state: PetState, now: number): boolean {
    const accumulatedMs = state.activity?.accumulatedMs ?? null;
    const completedSinceSave =
      accumulatedMs === null && this.lastPersistedActivityMs !== null;
    const checkpointDue =
      accumulatedMs !== null &&
      (this.lastPersistedActivityMs === null ||
        accumulatedMs - this.lastPersistedActivityMs >=
          WORK_CHECKPOINT_INTERVAL_MS);

    if (!completedSinceSave && !checkpointDue) {
      return false;
    }

    this.save(state, now, false);
    return true;
  }

  saveClean(state: PetState, now: number): void {
    this.save(state, now, true);
  }

  saveCommand(state: PetState, now: number): void {
    this.save(state, now, false);
  }

  savePosition(position: WindowPoint, state: PetState, now: number): void {
    this.position = { ...position };
    this.save(state, now, false);
  }

  private save(state: PetState, now: number, cleanExit: boolean): void {
    this.repository.save({
      cleanExit,
      position: this.position,
      savedAt: now,
      state,
    });
    this.lastPersistedActivityMs = state.activity?.accumulatedMs ?? null;
  }
}
