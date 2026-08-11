import { randomUUID } from "node:crypto";

import {
  gmailTarget,
  isQuietTime,
  notificationText,
} from "../domain/email-notifications.js";
import { IntegrationSettingsSchema } from "../shared/integration-contracts.js";
import type {
  GmailMessageDetails,
  GmailMessageReference,
  GoogleAccessToken,
  GoogleCredential,
  IntegrationCommand,
  IntegrationDurableState,
  IntegrationSnapshot,
  MailNotification,
} from "../shared/integration-types.js";
import type { DiagnosticLogger } from "../persistence/diagnostic-logger.js";
import type { GoogleCredentialVault } from "../persistence/google-credential-vault.js";
import type { IntegrationRepository } from "../persistence/integration-repository.js";
import { PersistenceError } from "../persistence/persistence-error.js";

const GMAIL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;
export const GMAIL_POLL_INTERVAL_MS = 10 * 60 * 1_000;
const ACCESS_TOKEN_MARGIN_MS = 60_000;

export interface GoogleAuthorizationClient {
  authorize(): Promise<{ access: GoogleAccessToken; credential: GoogleCredential }>;
  refresh(refreshToken: string): Promise<GoogleAccessToken>;
  revoke(token: string): Promise<void>;
}

export interface GmailReader {
  listUnread(accessToken: string, since: number, detectedAt: number): Promise<GmailMessageReference[]>;
  loadDetails(accessToken: string, reference: GmailMessageReference): Promise<GmailMessageDetails>;
}

interface ActionableNotification extends MailNotification {
  targetUrl: string;
}

type SnapshotListener = (snapshot: IntegrationSnapshot) => void;
type NotificationListener = (notifications: MailNotification[]) => void;

function errorInfo(error: unknown): {
  code: string;
  message: string;
  reauthRequired: boolean;
} {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return {
      code: error.code,
      message: error.message,
      reauthRequired:
        "reauthRequired" in error && error.reauthRequired === true,
    };
  }
  return {
    code: "integration.unexpected_failure",
    message: "The Google integration failed unexpectedly.",
    reauthRequired: false,
  };
}

export class IntegrationController {
  private access: GoogleAccessToken | null = null;
  private credential: GoogleCredential | null = null;
  private durable: IntegrationDurableState;
  private lastError: string | null = null;
  private connectionState: IntegrationSnapshot["connectionState"];
  private syncing = false;
  private syncInFlight: Promise<void> | null = null;
  private readonly notifications: ActionableNotification[] = [];
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly notificationListeners = new Set<NotificationListener>();

  constructor(
    private readonly repository: IntegrationRepository,
    private readonly vault: GoogleCredentialVault,
    private readonly oauth: GoogleAuthorizationClient | null,
    private readonly gmail: GmailReader,
    private readonly logger: DiagnosticLogger,
    private readonly now: () => number = Date.now,
  ) {
    this.durable = repository.loadIntegrationState();
    this.connectionState = oauth === null ? "unconfigured" : "disconnected";
  }

  async initialize(): Promise<void> {
    try {
      this.credential = await this.vault.load();
    } catch (error: unknown) {
      this.connectionState = "error";
      this.lastError = errorInfo(error).message;
      this.publishSnapshot();
      return;
    }
    if (this.oauth === null) {
      this.connectionState = "unconfigured";
      this.publishSnapshot();
      return;
    }
    if (this.credential === null) {
      this.connectionState = "disconnected";
      this.publishSnapshot();
      return;
    }
    this.connectionState = "connected";
    this.publishSnapshot();
    await this.sync().catch(() => undefined);
  }

  getSnapshot(): IntegrationSnapshot {
    return {
      accountEmail: this.credential?.accountEmail ?? null,
      configured: this.oauth !== null,
      connectionState: this.connectionState,
      lastAnnouncementAt: this.durable.lastAnnouncementAt,
      lastAnnouncementCount: this.durable.lastAnnouncementCount,
      lastError: this.lastError,
      lastSyncAt: this.durable.lastSyncAt,
      settings: structuredClone(this.durable.settings),
      syncing: this.syncing,
    };
  }

  getNotifications(): MailNotification[] {
    return this.notifications.map(({ targetUrl: _targetUrl, ...notification }) => ({
      ...notification,
    }));
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeNotifications(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  async execute(command: IntegrationCommand): Promise<IntegrationSnapshot> {
    switch (command.type) {
      case "connect":
        await this.connect();
        break;
      case "disconnect":
        await this.disconnect();
        break;
      case "refresh":
        await this.sync();
        break;
      case "setPrivacyMode":
        this.saveSettings({
          ...this.durable.settings,
          privacyMode: command.privacyMode,
          settingsVersion: command.baseVersion + 1,
        }, command.baseVersion);
        break;
      case "setQuietHours":
        this.saveSettings({
          ...this.durable.settings,
          quietEndMinutes: command.endMinutes,
          quietHoursEnabled: command.enabled,
          quietStartMinutes: command.startMinutes,
          settingsVersion: command.baseVersion + 1,
        }, command.baseVersion);
        if (!isQuietTime(this.durable.settings, new Date(this.now()))) {
          await this.releasePending();
        }
        break;
    }
    return this.getSnapshot();
  }

  async tick(): Promise<void> {
    if (this.credential === null || this.oauth === null) return;
    const now = this.now();
    if (
      this.durable.lastSyncAt === null ||
      now - this.durable.lastSyncAt >= GMAIL_POLL_INTERVAL_MS
    ) {
      await this.sync().catch(() => undefined);
    } else if (!isQuietTime(this.durable.settings, new Date(now))) {
      await this.releasePending().catch(() => undefined);
    }
  }

  dismissNotification(notificationId: string): void {
    const index = this.notifications.findIndex((item) => item.notificationId === notificationId);
    if (index < 0) return;
    this.notifications.splice(index, 1);
    this.publishNotifications();
  }

  takeNotificationTarget(notificationId: string): string | null {
    const notification = this.notifications.find((item) => item.notificationId === notificationId);
    if (notification === undefined) return null;
    this.dismissNotification(notificationId);
    return notification.targetUrl;
  }

  private async connect(): Promise<void> {
    if (this.oauth === null) {
      throw new Error("Google integration is not configured.");
    }
    this.connectionState = "connecting";
    this.lastError = null;
    this.publishSnapshot();
    let authorization: Awaited<ReturnType<GoogleAuthorizationClient["authorize"]>>;
    try {
      authorization = await this.oauth.authorize();
      await this.vault.save(authorization.credential);
    } catch (error: unknown) {
      const info = errorInfo(error);
      this.connectionState = "disconnected";
      this.lastError = info.message;
      this.logger.write("warning", info.code, info.message);
      this.publishSnapshot();
      throw error;
    }
    this.credential = authorization.credential;
    this.access = authorization.access;
    this.connectionState = "connected";
    this.publishSnapshot();
    await this.sync();
  }

  private async disconnect(): Promise<void> {
    const token = this.credential?.refreshToken;
    await this.vault.clear();
    this.credential = null;
    this.access = null;
    this.connectionState = this.oauth === null ? "unconfigured" : "disconnected";
    this.lastError = null;
    this.publishSnapshot();
    if (token !== undefined && this.oauth !== null) {
      await this.oauth.revoke(token).catch((error: unknown) => {
        const info = errorInfo(error);
        this.logger.write("warning", info.code, "Local Google credentials were removed; remote revocation could not be confirmed.");
      });
    }
  }

  private saveSettings(
    settings: IntegrationDurableState["settings"],
    expectedVersion: number,
  ): void {
    if (expectedVersion !== this.durable.settings.settingsVersion) {
      throw new Error("Integration settings changed in another window.");
    }
    const validated = IntegrationSettingsSchema.parse(settings);
    this.repository.saveIntegrationSettings(validated, expectedVersion);
    this.durable = { ...this.durable, settings: validated };
    this.publishSnapshot();
  }

  private async sync(): Promise<void> {
    if (this.syncInFlight !== null) return this.syncInFlight;
    this.syncInFlight = this.performSync().finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private async performSync(): Promise<void> {
    if (this.credential === null || this.oauth === null) {
      throw new Error("Connect Google before refreshing Gmail.");
    }
    this.syncing = true;
    this.lastError = null;
    this.publishSnapshot();
    try {
      const access = await this.ensureAccess();
      const now = this.now();
      const messages = await this.gmail.listUnread(
        access.accessToken,
        Math.max(0, now - GMAIL_LOOKBACK_MS),
        now,
      );
      this.repository.recordDetectedGmailMessages(messages);
      this.repository.saveIntegrationSync(now);
      this.durable = { ...this.durable, lastSyncAt: now };
      this.connectionState = "connected";
      if (!isQuietTime(this.durable.settings, new Date(now))) {
        await this.releasePending(access);
      }
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error;
      const info = errorInfo(error);
      this.lastError = info.message;
      this.logger.write("warning", info.code, info.message);
      if (info.reauthRequired) {
        await this.vault.clear().catch(() => undefined);
        this.credential = null;
        this.access = null;
        this.connectionState = "reauthRequired";
      }
      throw error;
    } finally {
      this.syncing = false;
      this.publishSnapshot();
    }
  }

  private async ensureAccess(): Promise<GoogleAccessToken> {
    const now = this.now();
    if (this.access !== null && this.access.expiresAt - now > ACCESS_TOKEN_MARGIN_MS) {
      return this.access;
    }
    if (this.oauth === null || this.credential === null) {
      throw new Error("Google credentials are unavailable.");
    }
    this.access = await this.oauth.refresh(this.credential.refreshToken);
    return this.access;
  }

  private async releasePending(existingAccess?: GoogleAccessToken): Promise<void> {
    if (isQuietTime(this.durable.settings, new Date(this.now()))) return;
    const pending = this.repository.loadPendingGmailMessages(500);
    if (pending.length === 0) return;
    let newest: GmailMessageDetails | null = null;
    if (this.durable.settings.privacyMode !== "countOnly") {
      const access = existingAccess ?? await this.ensureAccess();
      newest = await this.gmail.loadDetails(access.accessToken, pending.at(-1)!);
    }
    const announcedAt = this.now();
    this.repository.markGmailMessagesAnnounced(
      pending.map(({ messageId }) => messageId),
      announcedAt,
    );
    this.durable = {
      ...this.durable,
      lastAnnouncementAt: announcedAt,
      lastAnnouncementCount: pending.length,
    };
    this.notifications.push({
      count: pending.length,
      createdAt: announcedAt,
      notificationId: randomUUID(),
      targetUrl: gmailTarget(
        this.durable.settings.privacyMode === "countOnly"
          ? null
          : (newest?.threadId ?? null),
      ),
      text: notificationText(pending.length, this.durable.settings.privacyMode, newest),
    });
    this.publishNotifications();
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) listener(snapshot);
  }

  private publishNotifications(): void {
    const notifications = this.getNotifications();
    for (const listener of this.notificationListeners) listener(notifications);
  }
}
