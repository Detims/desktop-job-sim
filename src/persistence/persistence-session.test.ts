import { describe, expect, it } from "vitest";

import type { PersistedPetRecord } from "../shared/pet-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";
import type { MemoryEntry } from "../shared/memory-types.js";
import {
  advancePetState,
  createInitialPetState,
  startCareerJob,
  startPrototypeJob,
  startPrototypeStudy,
} from "../simulation/pet-simulation.js";
import { enrollCareer } from "../domain/career.js";
import type { PetRepository } from "./pet-repository.js";
import { PersistenceSession } from "./persistence-session.js";

class FakeRepository implements PetRepository {
  readonly events: MeaningfulEvent[] = [];
  readonly memories: MemoryEntry[] = [];
  readonly records: PersistedPetRecord[] = [];

  close(): void {}

  load(): PersistedPetRecord | null {
    return this.records.at(-1) ?? null;
  }

  save(
    record: PersistedPetRecord,
    events: readonly MeaningfulEvent[] = [],
    memories: readonly MemoryEntry[] = [],
  ): void {
    this.records.push(structuredClone(record));
    this.events.push(...structuredClone(events));
    this.memories.push(...structuredClone(memories));
  }
}

describe("PersistenceSession", () => {
  it("checkpoints an active activity every five accumulated seconds", () => {
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

  it("checkpoints study using the same five-second durability bound", () => {
    const initial = startPrototypeStudy(
      createInitialPetState(0),
      0,
      { restRecovery: 0.05, studyGain: 0.05 },
    );
    const repository = new FakeRepository();
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
    );
    const fiveSeconds = advancePetState(initial, 5_000, 5_000);

    expect(session.maybeCheckpoint(fiveSeconds, 5_000)).toBe(true);
    expect(repository.records[0]?.state.activity?.type).toBe("study");
    expect(
      repository.records[0]?.state.knowledge["core:general"],
    ).toBeGreaterThan(0);
  });

  it("checkpoints proportional Clerk XP within the same five-second bound", () => {
    const ready = {
      ...createInitialPetState(0),
      knowledge: { "core:general": 5 },
    };
    const initial = startCareerJob(
      enrollCareer(ready, "core:clerk", 0),
      0,
      "core:clerk:organize-mail",
    );
    const repository = new FakeRepository();
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
    );
    const fiveSeconds = advancePetState(initial, 5_000, 5_000);

    expect(session.maybeCheckpoint(fiveSeconds, 5_000)).toBe(true);
    expect(repository.records[0]?.state.activity?.type).toBe("careerJob");
    expect(
      repository.records[0]?.state.careers["core:clerk"]?.mastery,
    ).toBeCloseTo(10 / 3);
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

  it("materializes and publishes multiple events from one durable save", () => {
    const initial = createInitialPetState(0);
    const repository = new FakeRepository();
    const published: MeaningfulEvent[] = [];
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
      (event) => published.push(event),
    );

    session.saveCommand(initial, 100, [
      { summary: "Advanced.", type: "career.advanced" },
      { summary: "Promotion ready.", type: "career.promotion_ready" },
    ]);

    expect(repository.records).toHaveLength(1);
    expect(repository.events.map((event) => event.type)).toEqual([
      "career.advanced",
      "career.promotion_ready",
    ]);
    expect(published).toEqual(repository.events);
  });

  it("materializes a permanent memory in the same durable save", () => {
    const initial = createInitialPetState(0);
    const repository = new FakeRepository();
    const session = new PersistenceSession(
      repository,
      { x: 10, y: 20 },
      initial,
    );

    session.saveCommand(
      initial,
      100,
      { summary: "Exam passed.", type: "exam.passed" },
      {
        category: "qualification",
        description: "Passed an exam.",
        petId: initial.petId,
        title: "Certified",
      },
    );

    expect(repository.events[0]?.type).toBe("exam.passed");
    expect(repository.memories[0]).toMatchObject({
      occurredAt: 100,
      title: "Certified",
    });
  });
});
