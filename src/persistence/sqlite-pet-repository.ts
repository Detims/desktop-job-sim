import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PersistedPetRecordSchema } from "../shared/contracts.js";
import type { PersistedPetRecord } from "../shared/pet-types.js";
import type { DiagnosticLogger } from "./diagnostic-logger.js";
import type { PetRepository } from "./pet-repository.js";
import { PersistenceError } from "./persistence-error.js";

export const CURRENT_SCHEMA_VERSION = 1;

export interface SqliteRepositoryPaths {
  backupPath: string;
  databasePath: string;
}

interface RuntimeRow {
  clean_exit: number;
  position_x: number;
  position_y: number;
  saved_at: number;
  state_json: string;
}

interface PragmaRow {
  [key: string]: number | string;
}

export class SqlitePetRepository implements PetRepository {
  private constructor(
    private database: DatabaseSync,
    private readonly logger: DiagnosticLogger,
  ) {}

  static open(
    paths: SqliteRepositoryPaths,
    logger: DiagnosticLogger,
  ): SqlitePetRepository {
    mkdirSync(dirname(paths.databasePath), { recursive: true });
    const existed =
      existsSync(paths.databasePath) && statSync(paths.databasePath).size > 0;
    let database: DatabaseSync | null = null;

    try {
      database = SqlitePetRepository.openDatabase(paths.databasePath);
      SqlitePetRepository.assertHealthy(database);
      const schemaVersion = SqlitePetRepository.readSchemaVersion(database);

      if (schemaVersion > CURRENT_SCHEMA_VERSION) {
        throw new PersistenceError(
          "database.unsupported_schema",
          `Database schema ${schemaVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}.`,
        );
      }

      if (schemaVersion < CURRENT_SCHEMA_VERSION) {
        if (existed) {
          database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
          database.close();
          database = null;
          SqlitePetRepository.createVerifiedBackup(paths, logger);
          database = SqlitePetRepository.openDatabase(paths.databasePath);
        }

        SqlitePetRepository.migrate(database, schemaVersion);
        SqlitePetRepository.assertHealthy(database);
        logger.write(
          "info",
          "database.migrated",
          "The local database schema was migrated successfully.",
          { fromVersion: schemaVersion, toVersion: CURRENT_SCHEMA_VERSION },
        );
      }

      database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
      return new SqlitePetRepository(database, logger);
    } catch (error: unknown) {
      database?.close();
      const persistenceError =
        error instanceof PersistenceError
          ? error
          : new PersistenceError(
              "database.open_failed",
              "The local database could not be opened safely.",
              { cause: error },
            );
      logger.write(
        "error",
        persistenceError.eventCode,
        persistenceError.message,
        { cause: error instanceof Error ? error.message : String(error) },
      );
      throw persistenceError;
    }
  }

  close(): void {
    this.database.close();
  }

  load(): PersistedPetRecord | null {
    try {
      const row = this.database
        .prepare(
          `SELECT state_json, position_x, position_y, saved_at, clean_exit
             FROM pet_runtime
            WHERE id = 1`,
        )
        .get() as RuntimeRow | undefined;

      if (row === undefined) {
        return null;
      }

      return PersistedPetRecordSchema.parse({
        cleanExit: row.clean_exit === 1,
        position: { x: row.position_x, y: row.position_y },
        savedAt: row.saved_at,
        state: JSON.parse(row.state_json),
      });
    } catch (error: unknown) {
      const wrapped = new PersistenceError(
        "database.state_invalid",
        "Persisted pet state failed validation.",
        { cause: error },
      );
      this.logger.write("error", wrapped.eventCode, wrapped.message, {
        cause: error instanceof Error ? error.message : String(error),
      });
      throw wrapped;
    }
  }

  save(record: PersistedPetRecord): void {
    const validated = PersistedPetRecordSchema.parse(record);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO pet_runtime (
             id, state_json, position_x, position_y, saved_at, clean_exit
           ) VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             state_json = excluded.state_json,
             position_x = excluded.position_x,
             position_y = excluded.position_y,
             saved_at = excluded.saved_at,
             clean_exit = excluded.clean_exit`,
        )
        .run(
          JSON.stringify(validated.state),
          validated.position.x,
          validated.position.y,
          validated.savedAt,
          validated.cleanExit ? 1 : 0,
        );
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      this.database.exec("ROLLBACK");
      const wrapped = new PersistenceError(
        "database.save_failed",
        "Pet state could not be saved transactionally.",
        { cause: error },
      );
      this.logger.write("error", wrapped.eventCode, wrapped.message, {
        cause: error instanceof Error ? error.message : String(error),
      });
      throw wrapped;
    }
  }

  private static assertHealthy(database: DatabaseSync): void {
    const row = database.prepare("PRAGMA integrity_check").get() as
      | PragmaRow
      | undefined;
    if (row?.integrity_check !== "ok") {
      throw new PersistenceError(
        "database.integrity_failed",
        "The local database failed its integrity check.",
      );
    }
  }

  private static createVerifiedBackup(
    paths: SqliteRepositoryPaths,
    logger: DiagnosticLogger,
  ): void {
    const temporaryBackupPath = `${paths.backupPath}.tmp`;
    rmSync(temporaryBackupPath, { force: true });

    try {
      copyFileSync(paths.databasePath, temporaryBackupPath);
      const backup = new DatabaseSync(temporaryBackupPath, { readOnly: true });
      try {
        SqlitePetRepository.assertHealthy(backup);
      } finally {
        backup.close();
      }
      copyFileSync(temporaryBackupPath, paths.backupPath);
      logger.write(
        "info",
        "database.backup_created",
        "A verified pre-migration database backup was created.",
      );
    } catch (error: unknown) {
      throw new PersistenceError(
        "database.backup_failed",
        "A verified pre-migration backup could not be created.",
        { cause: error },
      );
    } finally {
      rmSync(temporaryBackupPath, { force: true });
    }
  }

  private static migrate(database: DatabaseSync, fromVersion: number): void {
    database.exec("BEGIN IMMEDIATE");
    try {
      if (fromVersion < 1) {
        database.exec(`
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
      }
      database.exec("COMMIT");
    } catch (error: unknown) {
      database.exec("ROLLBACK");
      throw new PersistenceError(
        "database.migration_failed",
        "The local database migration failed and was rolled back.",
        { cause: error },
      );
    }
  }

  private static openDatabase(path: string): DatabaseSync {
    return new DatabaseSync(path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
  }

  private static readSchemaVersion(database: DatabaseSync): number {
    const row = database.prepare("PRAGMA user_version").get() as
      | PragmaRow
      | undefined;
    const version = row?.user_version;
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new PersistenceError(
        "database.schema_invalid",
        "The local database schema version is invalid.",
      );
    }
    return version;
  }
}
