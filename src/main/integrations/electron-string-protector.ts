import { safeStorage } from "electron";

import type { StringProtector } from "../../persistence/google-credential-vault.js";

export class ElectronStringProtector implements StringProtector {
  async isAvailable(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable();
  }

  async encrypt(plaintext: string): Promise<Buffer> {
    return safeStorage.encryptStringAsync(plaintext);
  }

  async decrypt(ciphertext: Buffer): Promise<string> {
    const result = await safeStorage.decryptStringAsync(ciphertext);
    return result.result;
  }
}
