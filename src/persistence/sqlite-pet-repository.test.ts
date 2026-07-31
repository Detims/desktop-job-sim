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
    expect(version.user_version).toBe(2);
    migrated.close();
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
