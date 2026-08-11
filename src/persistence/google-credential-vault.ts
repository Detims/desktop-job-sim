import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import { GoogleCredentialSchema } from "../shared/integration-contracts.js";
import type { GoogleCredential } from "../shared/integration-types.js";
import type { DiagnosticLogger } from "./diagnostic-logger.js";
import { PersistenceError } from "./persistence-error.js";

export interface StringProtector {
  decrypt(ciphertext: Buffer): Promise<string>;
  encrypt(plaintext: string): Promise<Buffer>;
  isAvailable(): Promise<boolean>;
}

export interface GoogleCredentialVault {
  clear(): Promise<void>;
  load(): Promise<GoogleCredential | null>;
  save(credential: GoogleCredential): Promise<void>;
}

export class EncryptedGoogleCredentialVault implements GoogleCredentialVault {
  constructor(
    private readonly credentialPath: string,
    private readonly protector: StringProtector,
    private readonly logger: DiagnosticLogger,
  ) {}

  async load(): Promise<GoogleCredential | null> {
    let ciphertext: Buffer;
    try {
      ciphertext = await fs.readFile(this.credentialPath);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw this.failure("credential.read_failed", "Google credentials could not be read.", error);
    }
    try {
      await this.requireProtection();
      return GoogleCredentialSchema.parse(JSON.parse(
        await this.protector.decrypt(ciphertext),
      ));
    } catch (error: unknown) {
      throw this.failure(
        "credential.decrypt_failed",
        "Google credentials could not be decrypted safely.",
        error,
      );
    }
  }

  async save(credential: GoogleCredential): Promise<void> {
    const validated = GoogleCredentialSchema.parse(credential);
    const temporaryPath = `${this.credentialPath}.tmp`;
    try {
      await this.requireProtection();
      const ciphertext = await this.protector.encrypt(JSON.stringify(validated));
      await fs.mkdir(dirname(this.credentialPath), { recursive: true });
      await fs.writeFile(temporaryPath, ciphertext, { flag: "w" });
      await fs.rename(temporaryPath, this.credentialPath);
    } catch (error: unknown) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw this.failure(
        "credential.save_failed",
        "Google credentials could not be encrypted and saved.",
        error,
      );
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.credentialPath, { force: true });
      await fs.rm(`${this.credentialPath}.tmp`, { force: true });
    } catch (error: unknown) {
      throw this.failure(
        "credential.clear_failed",
        "Google credentials could not be removed.",
        error,
      );
    }
  }

  private async requireProtection(): Promise<void> {
    if (!(await this.protector.isAvailable())) {
      throw new Error("OS-backed encryption is unavailable.");
    }
  }

  private failure(code: string, message: string, cause: unknown): PersistenceError {
    const error = new PersistenceError(code, message, { cause });
    this.logger.write("error", code, message);
    return error;
  }
}
