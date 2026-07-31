import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";

export type DiagnosticSeverity = "error" | "info" | "warning";

export interface DiagnosticRecord {
  context?: Readonly<Record<string, unknown>>;
  eventCode: string;
  message: string;
  severity: DiagnosticSeverity;
  timestamp: string;
}

export interface DiagnosticLoggerOptions {
  maxBytes?: number;
  retainedFiles?: number;
  userDataPath: string;
}

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_RETAINED_FILES = 5;

export class DiagnosticLogger {
  private readonly maxBytes: number;
  private readonly retainedFiles: number;

  constructor(
    private readonly filePath: string,
    private readonly options: DiagnosticLoggerOptions,
  ) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.retainedFiles =
      options.retainedFiles ?? DEFAULT_RETAINED_FILES;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  write(
    severity: DiagnosticSeverity,
    eventCode: string,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    const record: DiagnosticRecord = {
      ...(context === undefined
        ? {}
        : { context: this.sanitizeValue(context) as Record<string, unknown> }),
      eventCode,
      message: this.sanitizeString(message),
      severity,
      timestamp: new Date().toISOString(),
    };
    const line = `${JSON.stringify(record)}\n`;

    try {
      this.rotateIfNeeded(Buffer.byteLength(line));
      appendFileSync(this.filePath, line, { encoding: "utf8" });
    } catch (error: unknown) {
      console.error("Unable to write the local diagnostic log.", error);
    }
  }

  private rotateIfNeeded(incomingBytes: number): void {
    if (
      !existsSync(this.filePath) ||
      statSync(this.filePath).size + incomingBytes <= this.maxBytes
    ) {
      return;
    }

    for (let index = this.retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${this.filePath}.${index}`;
      if (!existsSync(source)) {
        continue;
      }

      const destination = `${this.filePath}.${index + 1}`;
      rmSync(destination, { force: true });
      renameSync(source, destination);
    }

    if (this.retainedFiles > 0) {
      const firstRotation = `${this.filePath}.1`;
      rmSync(firstRotation, { force: true });
      renameSync(this.filePath, firstRotation);
    } else {
      rmSync(this.filePath, { force: true });
    }
  }

  private sanitizeString(value: string): string {
    const normalizedRoot = this.options.userDataPath.replaceAll("\\", "/");
    return value
      .replaceAll("\\", "/")
      .replaceAll(normalizedRoot, "<userData>");
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === "string") {
      return this.sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.sanitizeValue(item),
        ]),
      );
    }
    return value;
  }
}
