import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DiagnosticLogger } from "./diagnostic-logger.js";
import {
  EncryptedGoogleCredentialVault,
  type StringProtector,
} from "./google-credential-vault.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function fixture(protector?: StringProtector) {
  const directory = mkdtempSync(join(tmpdir(), "desktop-pet-credential-"));
  directories.push(directory);
  const credentialPath = join(directory, "credentials", "google.bin");
  const diagnosticPath = join(directory, "diagnostics.jsonl");
  const defaultProtector: StringProtector = {
    async decrypt(value) { return Buffer.from(value.toString(), "base64").toString("utf8"); },
    async encrypt(value) { return Buffer.from(Buffer.from(value).toString("base64")); },
    async isAvailable() { return true; },
  };
  return {
    credentialPath,
    diagnosticPath,
    vault: new EncryptedGoogleCredentialVault(
      credentialPath,
      protector ?? defaultProtector,
      new DiagnosticLogger(diagnosticPath, { userDataPath: directory }),
    ),
  };
}

describe("EncryptedGoogleCredentialVault", () => {
  it("round-trips encrypted credentials and clears them", async () => {
    const { credentialPath, vault } = fixture();
    const credential = { accountEmail: "pet@example.com", refreshToken: "private-refresh-token" };
    expect(await vault.load()).toBeNull();
    await vault.save(credential);
    expect(readFileSync(credentialPath, "utf8")).not.toContain("private-refresh-token");
    expect(await vault.load()).toEqual(credential);
    await vault.clear();
    expect(await vault.load()).toBeNull();
  });

  it("replaces an existing encrypted credential atomically", async () => {
    const { vault } = fixture();
    await vault.save({
      accountEmail: "first@example.com",
      refreshToken: "first-token",
    });
    await vault.save({
      accountEmail: "second@example.com",
      refreshToken: "second-token",
    });
    await expect(vault.load()).resolves.toEqual({
      accountEmail: "second@example.com",
      refreshToken: "second-token",
    });
  });

  it("fails closed without exposing a token in diagnostics", async () => {
    const { diagnosticPath, vault } = fixture({
      async decrypt() { throw new Error("decryption failed"); },
      async encrypt() { throw new Error("token=private-refresh-token"); },
      async isAvailable() { return true; },
    });
    await expect(vault.save({
      accountEmail: "pet@example.com",
      refreshToken: "private-refresh-token",
    })).rejects.toThrow("could not be encrypted");
    expect(readFileSync(diagnosticPath, "utf8")).not.toContain("private-refresh-token");
  });
});
