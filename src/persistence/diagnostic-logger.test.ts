import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DiagnosticLogger } from "./diagnostic-logger.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("DiagnosticLogger", () => {
  it("writes JSONL and redacts the user-data path", () => {
    const directory = mkdtempSync(join(tmpdir(), "desktop-pet-log-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "diagnostics.jsonl");
    const logger = new DiagnosticLogger(path, { userDataPath: directory });

    logger.write("error", "database.test", `Failure in ${directory}`, {
      path: join(directory, "pet.sqlite"),
    });

    const record = JSON.parse(readFileSync(path, "utf8"));
    expect(record.eventCode).toBe("database.test");
    expect(record.message).toContain("<userData>");
    expect(record.context.path).toContain("<userData>");
    expect(readFileSync(path, "utf8")).not.toContain(
      directory.replaceAll("\\", "/"),
    );
  });

  it("rotates bounded files", () => {
    const directory = mkdtempSync(join(tmpdir(), "desktop-pet-log-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "diagnostics.jsonl");
    const logger = new DiagnosticLogger(path, {
      maxBytes: 180,
      retainedFiles: 2,
      userDataPath: directory,
    });

    for (let index = 0; index < 8; index += 1) {
      logger.write("info", `test.${index}`, "A diagnostic record.");
    }

    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.1`)).toBe(true);
    expect(existsSync(`${path}.2`)).toBe(true);
    expect(existsSync(`${path}.3`)).toBe(false);
  });
});
