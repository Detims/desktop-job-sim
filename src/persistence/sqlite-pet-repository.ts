import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { assertValidHomeLayout } from "../domain/home-layout.js";
import { HomeLayoutSchema } from "../shared/home-contracts.js";
import { PersistedPetRecordSchema } from "../shared/contracts.js";
import { MemoryEntrySchema } from "../shared/memory-contracts.js";
import {
  AppSettingsSchema,
  MeaningfulEventSchema,
} from "../shared/settings-activity-contracts.js";
import type { HomeLayout } from "../shared/home-types.js";
import type { PersistedPetRecord } from "../shared/pet-types.js";
import type {
  MemoryCursor,
  MemoryEntry,
  MemoryPage,
} from "../shared/memory-types.js";
import {
  DEFAULT_APP_SETTINGS,
  type ActivityCursor,
  type ActivityPage,
  type AppSettings,
  type MeaningfulEvent,
} from "../shared/settings-activity-types.js";
import type { DiagnosticLogger } from "./diagnostic-logger.js";
import type { HomeLayoutRepository } from "./home-layout-repository.js";
import type { PetRepository } from "./pet-repository.js";
import type { SettingsActivityRepository } from "./settings-activity-repository.js";
import type { MemoryRepository } from "./memory-repository.js";
import { PersistenceError } from "./persistence-error.js";

export const CURRENT_SCHEMA_VERSION = 8;

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

interface HomeLayoutRow {
  layout_json: string;
  layout_version: number;
}

interface SettingsRow {
  activity_retention: string;
  always_on_top: number;
  care_intensity: string;
  settings_version: number;
}

interface EventRow {
  details_json: string;
  event_id: string;
  occurred_at: number;
  pet_id: string | null;
  retention: string;
  summary: string;
  type: string;
}

interface MemoryRow {
  category: string;
  description: string;
  memory_id: string;
  occurred_at: number;
  pet_id: string;
  title: string;
}

export class SqlitePetRepository
  implements PetRepository, HomeLayoutRepository, MemoryRepository, SettingsActivityRepository
{
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

  loadHomeLayout(): HomeLayout | null {
    try {
      const row = this.database
        .prepare(
          `SELECT layout_json, layout_version
             FROM home_layout
            WHERE id = 1`,
        )
        .get() as HomeLayoutRow | undefined;
      if (row === undefined) {
        return null;
      }

      const parsed = HomeLayoutSchema.parse(JSON.parse(row.layout_json));
      if (parsed.layoutVersion !== row.layout_version) {
        throw new Error("Home layout version columns do not match.");
      }
      return assertValidHomeLayout(parsed);
    } catch (error: unknown) {
      const wrapped = new PersistenceError(
        "database.home_layout_invalid",
        "Persisted home layout failed validation.",
        { cause: error },
      );
      this.logger.write("error", wrapped.eventCode, wrapped.message, {
        cause: error instanceof Error ? error.message : String(error),
      });
      throw wrapped;
    }
  }

  loadSettings(): AppSettings {
    try {
      const row = this.database
        .prepare(
          `SELECT care_intensity, always_on_top, activity_retention, settings_version
             FROM app_settings
            WHERE id = 1`,
        )
        .get() as SettingsRow | undefined;
      if (row === undefined) {
        throw new Error("The app settings singleton is missing.");
      }
      return AppSettingsSchema.parse({
        activityRetention: row.activity_retention,
        alwaysOnTop: row.always_on_top === 1,
        careIntensity: row.care_intensity,
        settingsVersion: row.settings_version,
      });
    } catch (error: unknown) {
      throw this.wrapAndLog(
        "database.settings_invalid",
        "Persisted application settings failed validation.",
        error,
      );
    }
  }

  loadActivityPage(
    before: ActivityCursor | undefined,
    limit: number,
  ): ActivityPage {
    try {
      const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
      const rows = (before === undefined
        ? this.database
            .prepare(
              `SELECT event_id, occurred_at, type, summary, details_json, pet_id, retention
                 FROM meaningful_event
                ORDER BY occurred_at DESC, event_id DESC
                LIMIT ?`,
            )
            .all(boundedLimit + 1)
        : this.database
            .prepare(
              `SELECT event_id, occurred_at, type, summary, details_json, pet_id, retention
                 FROM meaningful_event
                WHERE occurred_at < ? OR (occurred_at = ? AND event_id < ?)
                ORDER BY occurred_at DESC, event_id DESC
                LIMIT ?`,
            )
            .all(
              before.occurredAt,
              before.occurredAt,
              before.eventId,
              boundedLimit + 1,
            )) as unknown as EventRow[];
      const hasMore = rows.length > boundedLimit;
      const events = rows.slice(0, boundedLimit).map((row) => {
        const candidate = {
          details: JSON.parse(row.details_json),
          eventId: row.event_id,
          occurredAt: row.occurred_at,
          retention: row.retention,
          summary: row.summary,
          type: row.type,
          ...(row.pet_id === null ? {} : { petId: row.pet_id }),
        };
        return MeaningfulEventSchema.parse(candidate) as MeaningfulEvent;
      });
      const last = events.at(-1);
      return {
        events,
        nextCursor:
          hasMore && last !== undefined
            ? { eventId: last.eventId, occurredAt: last.occurredAt }
            : null,
      };
    } catch (error: unknown) {
      throw this.wrapAndLog(
        "database.activity_invalid",
        "Persisted activity history failed validation.",
        error,
      );
    }
  }

  loadMemoryPage(
    before: MemoryCursor | undefined,
    limit: number,
  ): MemoryPage {
    try {
      const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
      const rows = (before === undefined
        ? this.database
            .prepare(
              `SELECT memory_id, occurred_at, pet_id, category, title, description
                 FROM life_memory
                ORDER BY occurred_at DESC, memory_id DESC
                LIMIT ?`,
            )
            .all(boundedLimit + 1)
        : this.database
            .prepare(
              `SELECT memory_id, occurred_at, pet_id, category, title, description
                 FROM life_memory
                WHERE occurred_at < ? OR (occurred_at = ? AND memory_id < ?)
                ORDER BY occurred_at DESC, memory_id DESC
                LIMIT ?`,
            )
            .all(
              before.occurredAt,
              before.occurredAt,
              before.memoryId,
              boundedLimit + 1,
            )) as unknown as MemoryRow[];
      const hasMore = rows.length > boundedLimit;
      const memories = rows.slice(0, boundedLimit).map((row) =>
        MemoryEntrySchema.parse({
          category: row.category,
          description: row.description,
          memoryId: row.memory_id,
          occurredAt: row.occurred_at,
          petId: row.pet_id,
          title: row.title,
        }) as MemoryEntry,
      );
      const last = memories.at(-1);
      return {
        memories,
        nextCursor:
          hasMore && last !== undefined
            ? { memoryId: last.memoryId, occurredAt: last.occurredAt }
            : null,
      };
    } catch (error: unknown) {
      throw this.wrapAndLog(
        "database.memory_invalid",
        "Persisted life memories failed validation.",
        error,
      );
    }
  }

  save(
    record: PersistedPetRecord,
    events: readonly MeaningfulEvent[] = [],
    memories: readonly MemoryEntry[] = [],
  ): void {
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
      for (const event of events) this.insertEvent(event);
      for (const memory of memories) this.insertMemory(memory);
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

  saveHomeLayout(
    layout: HomeLayout,
    expectedVersion: number | null,
    event?: MeaningfulEvent,
  ): void {
    const validated = assertValidHomeLayout(HomeLayoutSchema.parse(layout));
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT layout_version FROM home_layout WHERE id = 1")
        .get() as Pick<HomeLayoutRow, "layout_version"> | undefined;
      const persistedVersion = row?.layout_version ?? null;
      if (persistedVersion !== expectedVersion) {
        throw new PersistenceError(
          "home.layout_conflict",
          "The home layout changed before this save could be applied.",
        );
      }

      this.database
        .prepare(
          `INSERT INTO home_layout (id, layout_json, layout_version)
           VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             layout_json = excluded.layout_json,
             layout_version = excluded.layout_version`,
        )
        .run(JSON.stringify(validated), validated.layoutVersion);
      if (event !== undefined) {
        this.insertEvent(event);
      }
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      this.database.exec("ROLLBACK");
      const wrapped =
        error instanceof PersistenceError
          ? error
          : new PersistenceError(
              "database.home_layout_save_failed",
              "The home layout could not be saved transactionally.",
              { cause: error },
            );
      this.logger.write("error", wrapped.eventCode, wrapped.message, {
        cause: error instanceof Error ? error.message : String(error),
      });
      throw wrapped;
    }
  }

  appendEvent(event: MeaningfulEvent): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.insertEvent(event);
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      this.database.exec("ROLLBACK");
      throw this.wrapAndLog(
        "database.activity_save_failed",
        "The activity event could not be saved transactionally.",
        error,
      );
    }
  }

  saveSettings(
    settings: AppSettings,
    expectedVersion: number,
    event: MeaningfulEvent,
    pruneOlderThan?: number,
  ): void {
    const validated = AppSettingsSchema.parse(settings);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT settings_version FROM app_settings WHERE id = 1")
        .get() as Pick<SettingsRow, "settings_version"> | undefined;
      if (row?.settings_version !== expectedVersion) {
        throw new PersistenceError(
          "settings.version_conflict",
          "Settings changed before this update could be applied.",
        );
      }
      this.database
        .prepare(
          `UPDATE app_settings
              SET care_intensity = ?, always_on_top = ?, activity_retention = ?, settings_version = ?
            WHERE id = 1`,
        )
        .run(
          validated.careIntensity,
          validated.alwaysOnTop ? 1 : 0,
          validated.activityRetention,
          validated.settingsVersion,
        );
      this.insertEvent(event);
      if (pruneOlderThan !== undefined) {
        this.database
          .prepare("DELETE FROM meaningful_event WHERE occurred_at < ?")
          .run(pruneOlderThan);
      }
      this.database.exec("COMMIT");
    } catch (error: unknown) {
      this.database.exec("ROLLBACK");
      const wrapped =
        error instanceof PersistenceError
          ? error
          : this.wrapAndLog(
              "database.settings_save_failed",
              "Settings could not be saved transactionally.",
              error,
            );
      if (wrapped === error) {
        this.logger.write("warning", wrapped.eventCode, wrapped.message);
      }
      throw wrapped;
    }
  }

  pruneActivity(olderThan: number): number {
    try {
      const result = this.database
        .prepare("DELETE FROM meaningful_event WHERE occurred_at < ?")
        .run(olderThan);
      return Number(result.changes);
    } catch (error: unknown) {
      throw this.wrapAndLog(
        "database.activity_prune_failed",
        "Expired activity events could not be pruned.",
        error,
      );
    }
  }

  private insertEvent(event: MeaningfulEvent): void {
    const validated = MeaningfulEventSchema.parse(event);
    this.database
      .prepare(
        `INSERT INTO meaningful_event (
           event_id, occurred_at, type, summary, details_json, pet_id, retention
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        validated.eventId,
        validated.occurredAt,
        validated.type,
        validated.summary,
        JSON.stringify(validated.details),
        validated.petId ?? null,
        validated.retention,
      );
  }

  private insertMemory(memory: MemoryEntry): void {
    const validated = MemoryEntrySchema.parse(memory);
    this.database
      .prepare(
        `INSERT INTO life_memory (
           memory_id, occurred_at, pet_id, category, title, description
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        validated.memoryId,
        validated.occurredAt,
        validated.petId,
        validated.category,
        validated.title,
        validated.description,
      );
  }

  private wrapAndLog(
    eventCode: string,
    message: string,
    error: unknown,
  ): PersistenceError {
    const wrapped = new PersistenceError(eventCode, message, { cause: error });
    this.logger.write("error", wrapped.eventCode, wrapped.message, {
      cause: error instanceof Error ? error.message : String(error),
    });
    return wrapped;
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
        `);
      }
      if (fromVersion < 2) {
        database.exec(`
          CREATE TABLE home_layout (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            layout_json TEXT NOT NULL,
            layout_version INTEGER NOT NULL CHECK (layout_version >= 0)
          ) STRICT;
        `);
      }
      if (fromVersion < 3) {
        database.exec(`
          CREATE TABLE app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            care_intensity TEXT NOT NULL,
            always_on_top INTEGER NOT NULL CHECK (always_on_top IN (0, 1)),
            activity_retention TEXT NOT NULL,
            settings_version INTEGER NOT NULL CHECK (settings_version >= 0)
          ) STRICT;
          CREATE TABLE meaningful_event (
            event_id TEXT PRIMARY KEY,
            occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
            type TEXT NOT NULL,
            summary TEXT NOT NULL,
            details_json TEXT NOT NULL,
            pet_id TEXT,
            retention TEXT NOT NULL
          ) STRICT;
          CREATE INDEX meaningful_event_chronology
            ON meaningful_event (occurred_at DESC, event_id DESC);
        `);
        database
          .prepare(
            `INSERT INTO app_settings (
               id, care_intensity, always_on_top, activity_retention, settings_version
             ) VALUES (1, ?, ?, ?, ?)`,
          )
          .run(
            DEFAULT_APP_SETTINGS.careIntensity,
            DEFAULT_APP_SETTINGS.alwaysOnTop ? 1 : 0,
            DEFAULT_APP_SETTINGS.activityRetention,
            DEFAULT_APP_SETTINGS.settingsVersion,
          );
      }
      if (fromVersion < 4) {
        // Career state is schema-controlled JSON inside pet_runtime. Bumping the
        // database version still guarantees a verified pre-migration backup.
      }
      if (fromVersion < 5) {
        database.exec(`
          CREATE TABLE life_memory (
            memory_id TEXT PRIMARY KEY,
            occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
            pet_id TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL
          ) STRICT;
          CREATE INDEX life_memory_chronology
            ON life_memory (occurred_at DESC, memory_id DESC);
        `);
      }
      if (fromVersion < 6) {
        // Household, inventory, and care state remain schema-controlled JSON
        // inside pet_runtime. The version bump creates a verified backup before
        // legacy wallet state is normalized into the household object.
      }
      if (fromVersion < 7) {
        // Relationship state remains schema-controlled JSON inside pet_runtime.
        // The version bump guarantees a verified backup before legacy saves
        // receive Affection, Bond, cooldown, cap, and milestone defaults.
      }
      if (fromVersion < 8) {
        // Burnout exposure and recurrence protection remain schema-controlled
        // JSON inside pet_runtime. Legacy saves receive neutral defaults.
      }
      database.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
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
