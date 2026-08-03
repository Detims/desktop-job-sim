import type {
  PetState,
  WindowPoint,
} from "../shared/pet-types.js";
import { materializeEvent } from "../shared/meaningful-event.js";
import type {
  MeaningfulEvent,
  MeaningfulEventDraft,
} from "../shared/settings-activity-types.js";
import type { PetRepository } from "./pet-repository.js";

export const ACTIVITY_CHECKPOINT_INTERVAL_MS = 5_000;

export class PersistenceSession {
  private lastPersistedActivityMs: number | null;

  constructor(
    private readonly repository: PetRepository,
    private position: WindowPoint,
    initialState: PetState,
    private readonly onActivity?: (event: MeaningfulEvent) => void,
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
          ACTIVITY_CHECKPOINT_INTERVAL_MS);

    if (!completedSinceSave && !checkpointDue) {
      return false;
    }

    this.save(state, now, false);
    return true;
  }

  saveClean(
    state: PetState,
    now: number,
    events?: MeaningfulEventDraft | readonly MeaningfulEventDraft[],
  ): void {
    this.save(state, now, true, events);
  }

  saveCommand(
    state: PetState,
    now: number,
    events?: MeaningfulEventDraft | readonly MeaningfulEventDraft[],
  ): void {
    this.save(state, now, false, events);
  }

  savePosition(position: WindowPoint, state: PetState, now: number): void {
    this.position = { ...position };
    this.save(state, now, false);
  }

  private save(
    state: PetState,
    now: number,
    cleanExit: boolean,
    drafts?: MeaningfulEventDraft | readonly MeaningfulEventDraft[],
  ): void {
    const normalizedDrafts =
      drafts === undefined ? [] : Array.isArray(drafts) ? drafts : [drafts];
    const events = normalizedDrafts.map((draft) => materializeEvent(draft, now));
    this.repository.save({
      cleanExit,
      position: this.position,
      savedAt: now,
      state,
    }, events);
    this.lastPersistedActivityMs = state.activity?.accumulatedMs ?? null;
    for (const event of events) this.onActivity?.(structuredClone(event));
  }
}
