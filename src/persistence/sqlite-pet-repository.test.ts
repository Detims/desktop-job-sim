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
});
