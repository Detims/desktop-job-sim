import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_INTEGRATION_SETTINGS } from "../shared/integration-types.js";
import type {
  GmailMessageReference,
  GoogleCredential,
  IntegrationDurableState,
  IntegrationSettings,
} from "../shared/integration-types.js";
import { DiagnosticLogger } from "../persistence/diagnostic-logger.js";
import type { GoogleCredentialVault } from "../persistence/google-credential-vault.js";
import type { IntegrationRepository } from "../persistence/integration-repository.js";
import {
  IntegrationController,
  type GmailReader,
  type GoogleAuthorizationClient,
} from "./integration-controller.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

class MemoryRepository implements IntegrationRepository {
  state: IntegrationDurableState;
  readonly messages = new Map<string, GmailMessageReference & { announcedAt: number | null }>();

  constructor(settings: IntegrationSettings = { ...DEFAULT_INTEGRATION_SETTINGS }) {
    this.state = {
      lastAnnouncementAt: null,
      lastAnnouncementCount: 0,
      lastSyncAt: null,
      settings,
    };
  }

  loadIntegrationState() { return structuredClone(this.state); }
  loadPendingGmailMessages(limit: number) {
    return [...this.messages.values()]
      .filter(({ announcedAt }) => announcedAt === null)
      .sort((left, right) => left.detectedAt - right.detectedAt)
      .slice(0, limit)
      .map(({ announcedAt: _announcedAt, ...message }) => message);
  }
  markGmailMessagesAnnounced(messageIds: readonly string[], announcedAt: number) {
    for (const id of messageIds) this.messages.get(id)!.announcedAt = announcedAt;
    this.state.lastAnnouncementAt = announcedAt;
    this.state.lastAnnouncementCount = messageIds.length;
  }
  recordDetectedGmailMessages(messages: readonly GmailMessageReference[]) {
    let inserted = 0;
    for (const message of messages) {
      if (!this.messages.has(message.messageId)) {
        this.messages.set(message.messageId, { ...message, announcedAt: null });
        inserted += 1;
      }
    }
    return inserted;
  }
  saveIntegrationSettings(settings: IntegrationSettings) { this.state.settings = structuredClone(settings); }
  saveIntegrationSync(syncAt: number) { this.state.lastSyncAt = syncAt; }
}

function fixture(input?: {
  credential?: GoogleCredential | null;
  now?: number;
  settings?: IntegrationSettings;
}) {
  const directory = mkdtempSync(join(tmpdir(), "desktop-pet-integration-"));
  directories.push(directory);
  let now = input?.now ?? new Date(2026, 0, 1, 12).getTime();
  let credential = input?.credential === undefined
    ? { accountEmail: "pet@example.com", refreshToken: "refresh" }
    : input.credential;
  const repository = new MemoryRepository(input?.settings);
  const vault: GoogleCredentialVault = {
    async clear() { credential = null; },
    async load() { return credential; },
    async save(value) { credential = value; },
  };
  const oauth: GoogleAuthorizationClient = {
    async authorize() {
      return {
        access: { accessToken: "authorized", expiresAt: now + 3_600_000 },
        credential: { accountEmail: "pet@example.com", refreshToken: "refresh" },
      };
    },
    async refresh() { return { accessToken: "access", expiresAt: now + 3_600_000 }; },
    async revoke() {},
  };
  const gmail: GmailReader = {
    async listUnread(_token, _since, detectedAt) {
      return [{ detectedAt, messageId: "message-1", threadId: "thread-1" }];
    },
    async loadDetails(_token, reference) {
      return { ...reference, preview: "Preview", sender: "Sender", subject: "Subject" };
    },
  };
  const controller = new IntegrationController(
    repository,
    vault,
    oauth,
    gmail,
    new DiagnosticLogger(join(directory, "diagnostics.jsonl"), { userDataPath: directory }),
    () => now,
  );
  return {
    controller,
    gmail,
    oauth,
    repository,
    setNow(value: number) { now = value; },
    vault,
  };
}

describe("IntegrationController", () => {
  it("synchronizes connected Gmail once and emits a private count-only batch", async () => {
    const { controller, repository } = fixture();
    await controller.initialize();
    expect(controller.getSnapshot()).toEqual(expect.objectContaining({
      accountEmail: "pet@example.com",
      connectionState: "connected",
      lastAnnouncementCount: 1,
      lastError: null,
    }));
    expect(controller.getNotifications()).toEqual([
      expect.objectContaining({ count: 1, text: "1 new email" }),
    ]);
    await controller.execute({ type: "refresh" });
    expect(repository.messages).toHaveLength(1);
    expect(controller.getNotifications()).toHaveLength(1);
  });

  it("defers during overnight quiet hours and releases one batch later", async () => {
    const night = new Date(2026, 0, 1, 23).getTime();
    const fixtureValue = fixture({
      now: night,
      settings: { ...DEFAULT_INTEGRATION_SETTINGS, quietHoursEnabled: true },
    });
    await fixtureValue.controller.initialize();
    expect(fixtureValue.controller.getNotifications()).toEqual([]);
    fixtureValue.setNow(new Date(2026, 0, 2, 12).getTime());
    await fixtureValue.controller.tick();
    expect(fixtureValue.controller.getNotifications()).toEqual([
      expect.objectContaining({ count: 1, text: "1 new email" }),
    ]);
  });

  it("uses transient details for richer privacy modes and never stores them", async () => {
    const value = fixture({ credential: null });
    await value.controller.initialize();
    await value.controller.execute({
      baseVersion: 0,
      privacyMode: "shortPreview",
      type: "setPrivacyMode",
    });
    await value.controller.execute({ type: "connect" });
    expect(value.controller.getNotifications()[0]?.text).toContain("Preview");
    expect(JSON.stringify(value.repository)).not.toContain("Sender");
    expect(JSON.stringify(value.repository)).not.toContain("Subject");
  });

  it("moves expired authorization to a reconnect state and clears credentials", async () => {
    const value = fixture();
    value.oauth.refresh = vi.fn().mockRejectedValue(Object.assign(
      new Error("Reconnect the account."),
      { code: "oauth.exchange_failed", reauthRequired: true },
    ));
    const clear = vi.spyOn(value.vault, "clear");
    await value.controller.initialize();
    expect(clear).toHaveBeenCalledOnce();
    expect(value.controller.getSnapshot().connectionState).toBe("reauthRequired");
  });
});
