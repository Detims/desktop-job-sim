export type EmailPrivacyMode = "countOnly" | "senderSubject" | "shortPreview";

export interface IntegrationSettings {
  privacyMode: EmailPrivacyMode;
  quietEndMinutes: number;
  quietHoursEnabled: boolean;
  quietStartMinutes: number;
  settingsVersion: number;
}

export type IntegrationConnectionState =
  | "unconfigured"
  | "disconnected"
  | "connecting"
  | "connected"
  | "reauthRequired"
  | "error";

export interface IntegrationSnapshot {
  accountEmail: string | null;
  configured: boolean;
  connectionState: IntegrationConnectionState;
  lastAnnouncementAt: number | null;
  lastAnnouncementCount: number;
  lastError: string | null;
  lastSyncAt: number | null;
  settings: IntegrationSettings;
  syncing: boolean;
}

export type IntegrationCommand =
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "refresh" }
  | {
      baseVersion: number;
      privacyMode: EmailPrivacyMode;
      type: "setPrivacyMode";
    }
  | {
      baseVersion: number;
      enabled: boolean;
      endMinutes: number;
      startMinutes: number;
      type: "setQuietHours";
    };

export interface GmailMessageReference {
  detectedAt: number;
  messageId: string;
  threadId: string;
}

export interface IntegrationDurableState {
  lastAnnouncementAt: number | null;
  lastAnnouncementCount: number;
  lastSyncAt: number | null;
  settings: IntegrationSettings;
}

export interface GoogleCredential {
  accountEmail: string;
  refreshToken: string;
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface GmailMessageDetails extends GmailMessageReference {
  preview: string;
  sender: string;
  subject: string;
}

export interface MailNotification {
  count: number;
  createdAt: number;
  notificationId: string;
  text: string;
}

export const DEFAULT_INTEGRATION_SETTINGS: Readonly<IntegrationSettings> = Object.freeze({
  privacyMode: "countOnly",
  quietEndMinutes: 8 * 60,
  quietHoursEnabled: false,
  quietStartMinutes: 22 * 60,
  settingsVersion: 0,
});
