import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { createInitialPetState } from "../simulation/pet-simulation.js";
import { createInitialHomeLayout } from "../domain/home-layout.js";
import { DiagnosticLogger } from "./diagnostic-logger.js";
import { PersistenceError } from "./persistence-error.js";
import { SqlitePetRepository } from "./sqlite-pet-repository.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";
import type { MemoryEntry } from "../shared/memory-types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "desktop-pet-db-"));
  temporaryDirectories.push(directory);
  const paths = {
    backupPath: join(directory, "pet.sqlite.backup"),
    databasePath: join(directory, "pet.sqlite"),
  };
  const logger = new DiagnosticLogger(
    join(directory, "diagnostics.jsonl"),
    { userDataPath: directory },
  );
  return { directory, logger, paths };
}

describe("SqlitePetRepository", () => {
  it("round-trips validated pet state and position", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    const record = {
      cleanExit: false,
      position: { x: 321, y: -45 },
      savedAt: 10_000,
      state: createInitialPetState(10_000),
    };

    repository.save(record);
    expect(repository.load()).toEqual(record);
    repository.close();
  });

  it("creates a verified backup before migrating an existing database", () => {
    const { logger, paths } = fixture();
    const legacy = new DatabaseSync(paths.databasePath);
    legacy.exec(
      "PRAGMA journal_mode = WAL; CREATE TABLE legacy_marker (value TEXT NOT NULL); INSERT INTO legacy_marker VALUES ('kept');",
    );
    legacy.close();

    const repository = SqlitePetRepository.open(paths, logger);
    repository.close();

    expect(existsSync(paths.backupPath)).toBe(true);
    const backup = new DatabaseSync(paths.backupPath, { readOnly: true });
    const marker = backup
      .prepare("SELECT value FROM legacy_marker")
      .get() as { value: string };
    expect(marker.value).toBe("kept");
    backup.close();
  });

  it("fails closed on corruption without replacing the prior backup", () => {
    const { logger, paths } = fixture();
    writeFileSync(paths.databasePath, "not a sqlite database");
    writeFileSync(paths.backupPath, "previous verified backup");

    expect(() => SqlitePetRepository.open(paths, logger)).toThrow(
      PersistenceError,
    );
    expect(readFileSync(paths.backupPath, "utf8")).toBe(
      "previous verified backup",
    );
  });

  it("rolls back a failed migration and keeps its verified backup", () => {
    const { logger, paths } = fixture();
    const incompatible = new DatabaseSync(paths.databasePath);
    incompatible.exec(
      "CREATE TABLE pet_runtime (legacy_value TEXT); INSERT INTO pet_runtime VALUES ('original');",
    );
    incompatible.close();

    expect(() => SqlitePetRepository.open(paths, logger)).toThrowError(
      expect.objectContaining({ eventCode: "database.migration_failed" }),
    );
    expect(existsSync(paths.backupPath)).toBe(true);

    const original = new DatabaseSync(paths.databasePath);
    const row = original
      .prepare("SELECT legacy_value FROM pet_runtime")
      .get() as { legacy_value: string };
    expect(row.legacy_value).toBe("original");
    original.close();
  });

  it("migrates schema version one to the home-layout schema", () => {
    const { logger, paths } = fixture();
    const versionOne = new DatabaseSync(paths.databasePath);
    versionOne.exec(`
      CREATE TABLE pet_runtime (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        saved_at INTEGER NOT NULL CHECK (saved_at >= 0),
        clean_exit INTEGER NOT NULL CHECK (clean_exit IN (0, 1))
      ) STRICT;
      PRAGMA user_version = 1;
    `);
    versionOne.close();

    const repository = SqlitePetRepository.open(paths, logger);
    expect(repository.loadHomeLayout()).toBeNull();
    repository.close();
    expect(existsSync(paths.backupPath)).toBe(true);

    const migrated = new DatabaseSync(paths.databasePath);
    const version = migrated.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    expect(version.user_version).toBe(10);
    migrated.close();
  });

  it("persists versioned settings and their audit event atomically", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    expect(repository.loadSettings()).toEqual({
      activityRetention: "thirtyDays",
      alwaysOnTop: true,
      autonomyMode: "manual",
      autonomyReserve: 10,
      careIntensity: "balanced",
      settingsVersion: 0,
    });

    const event: MeaningfulEvent = {
      details: { from: "balanced", to: "relaxed" },
      eventId: "event-settings",
      occurredAt: 20_000,
      retention: "standard",
      summary: "Care intensity changed to Relaxed.",
      type: "settings.care_intensity_changed",
    };
    repository.saveSettings(
      {
        ...repository.loadSettings(),
        careIntensity: "relaxed",
        settingsVersion: 1,
      },
      0,
      event,
    );

    expect(repository.loadSettings().careIntensity).toBe("relaxed");
    expect(repository.loadActivityPage(undefined, 100).events).toEqual([event]);
    expect(() =>
      repository.saveSettings(
        { ...repository.loadSettings(), alwaysOnTop: false, settingsVersion: 2 },
        0,
        { ...event, eventId: "stale" },
      ),
    ).toThrowError(expect.objectContaining({ eventCode: "settings.version_conflict" }));
    expect(repository.loadSettings().alwaysOnTop).toBe(true);
    repository.close();
  });

  it("stores pet state, exam event, and permanent memory atomically", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    const event: MeaningfulEvent = {
      details: { examId: "core:administrative-assistant-exam" },
      eventId: "exam-pass",
      occurredAt: 20_000,
      petId: "prototype-pet",
      retention: "standard",
      summary: "Exam passed.",
      type: "exam.passed",
    };
    const memory: MemoryEntry = {
      category: "qualification",
      description: "Passed the Administrative Assistant Certification Exam.",
      memoryId: "memory-exam-pass",
      occurredAt: 20_000,
      petId: "prototype-pet",
      title: "Administrative Assistant Certified",
    };
    const state = {
      ...createInitialPetState(20_000),
      qualifications: {
        "core:administrative-assistant-certification": {
          earnedAt: 20_000,
          qualificationId: "core:administrative-assistant-certification",
        },
      },
    };

    repository.save(
      { cleanExit: false, position: { x: 1, y: 2 }, savedAt: 20_000, state },
      [event],
      [memory],
    );

    expect(repository.load()?.state.qualifications).toEqual(state.qualifications);
    expect(repository.loadActivityPage(undefined, 10).events).toEqual([event]);
    expect(repository.loadMemoryPage(undefined, 10).memories).toEqual([memory]);
    repository.close();
  });

  it("rolls back exam state and event when its memory cannot be inserted", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    const initial = createInitialPetState(1_000);
    const memory: MemoryEntry = {
      category: "qualification",
      description: "Existing memory.",
      memoryId: "duplicate-memory",
      occurredAt: 1_000,
      petId: initial.petId,
      title: "Existing",
    };
    repository.save(
      { cleanExit: false, position: { x: 0, y: 0 }, savedAt: 1_000, state: initial },
      [],
      [memory],
    );

    expect(() =>
      repository.save(
        {
          cleanExit: false,
          position: { x: 0, y: 0 },
          savedAt: 2_000,
          state: { ...initial, household: { ...initial.household, wallet: 99 } },
        },
        [{
          details: {},
          eventId: "rolled-back-event",
          occurredAt: 2_000,
          petId: initial.petId,
          retention: "standard",
          summary: "Should roll back.",
          type: "exam.passed",
        }],
        [{ ...memory, occurredAt: 2_000 }],
      ),
    ).toThrowError(expect.objectContaining({ eventCode: "database.save_failed" }));

    expect(repository.load()?.state.household.wallet).toBe(0);
    expect(repository.loadActivityPage(undefined, 10).events).toEqual([]);
    expect(repository.loadMemoryPage(undefined, 10).memories).toEqual([memory]);
    repository.close();
  });

  it("pages newest-first with a stable timestamp and id cursor", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    for (const [eventId, occurredAt] of [["a", 100], ["b", 100], ["c", 90]] as const) {
      repository.appendEvent({
        details: {},
        eventId,
        occurredAt,
        retention: "standard",
        summary: `Event ${eventId}`,
        type: "startup.recovered",
      });
    }

    const first = repository.loadActivityPage(undefined, 2);
    expect(first.events.map((event) => event.eventId)).toEqual(["b", "a"]);
    expect(first.nextCursor).toEqual({ eventId: "a", occurredAt: 100 });
    expect(
      repository.loadActivityPage(first.nextCursor ?? undefined, 2).events
        .map((event) => event.eventId),
    ).toEqual(["c"]);
    repository.close();
  });

  it("stores a Home save and activity event in one transaction", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    const initial = createInitialHomeLayout();
    repository.saveHomeLayout(initial, null);
    const moved = {
      ...initial,
      furniture: initial.furniture.map((item) =>
        item.kind === "desk" ? { ...item, x: 7, y: 4 } : item,
      ),
      layoutVersion: 1,
    };
    repository.saveHomeLayout(moved, 0, {
      details: { layoutVersion: 1 },
      eventId: "home-save",
      occurredAt: 200,
      retention: "standard",
      summary: "Home layout saved.",
      type: "home.layout_saved",
    });
    expect(repository.loadActivityPage(undefined, 10).events[0]?.eventId).toBe("home-save");
    repository.close();
  });

  it("saves layouts with optimistic version checks", () => {
    const { logger, paths } = fixture();
    const repository = SqlitePetRepository.open(paths, logger);
    const initial = createInitialHomeLayout();
    repository.saveHomeLayout(initial, null);

    const moved = {
      ...initial,
      furniture: initial.furniture.map((item) =>
        item.kind === "desk" ? { ...item, x: 7, y: 4 } : item,
      ),
      layoutVersion: 1,
    };
    repository.saveHomeLayout(moved, 0);
    expect(repository.loadHomeLayout()).toEqual(moved);
    expect(() => repository.saveHomeLayout({ ...moved, layoutVersion: 2 }, 0))
      .toThrowError(expect.objectContaining({ eventCode: "home.layout_conflict" }));
    expect(repository.loadHomeLayout()).toEqual(moved);
    repository.close();
  });
});
