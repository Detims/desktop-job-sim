import { describe, expect, it } from "vitest";

import type { PersistedPetRecord } from "../shared/pet-types.js";
import {
  advancePetState,
  createInitialPetState,
  startPrototypeJob,
} from "../simulation/pet-simulation.js";
import type { PetRepository } from "./pet-repository.js";
import { PersistenceSession } from "./persistence-session.js";

class FakeRepository implements PetRepository {
  readonly records: PersistedPetRecord[] = [];

  close(): void {}

  load(): PersistedPetRecord | null {
    return this.records.at(-1) ?? null;
  }

  save(record: PersistedPetRecord): void {
    this.records.push(structuredClone(record));
  }
}

describe("PersistenceSession", () => {
  it("checkpoints active work every five accumulated seconds", () => {
    const initial = startPrototypeJob(createInitialPetState(0), 0);
    const repository = new FakeRepository();
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
    );
    const fourSeconds = advancePetState(initial, 4_000, 4_000);
    const fiveSeconds = advancePetState(initial, 5_000, 5_000);

    expect(session.maybeCheckpoint(fourSeconds, 4_000)).toBe(false);
    expect(session.maybeCheckpoint(fiveSeconds, 5_000)).toBe(true);
    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]?.state.activity?.accumulatedMs).toBe(5_000);
  });

  it("persists job completion immediately", () => {
    const initial = startPrototypeJob(createInitialPetState(0), 0);
    const repository = new FakeRepository();
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
    );
    const completed = advancePetState(initial, 15_000, 15_000);

    expect(session.maybeCheckpoint(completed, 15_000)).toBe(true);
    expect(repository.records[0]?.state.activity).toBeNull();
  });
});
