import type {
  GmailMessageReference,
  IntegrationDurableState,
  IntegrationSettings,
} from "../shared/integration-types.js";

export interface IntegrationRepository {
  loadIntegrationState(): IntegrationDurableState;
  loadPendingGmailMessages(limit: number): GmailMessageReference[];
  markGmailMessagesAnnounced(messageIds: readonly string[], announcedAt: number): void;
  recordDetectedGmailMessages(messages: readonly GmailMessageReference[]): number;
  saveIntegrationSettings(settings: IntegrationSettings, expectedVersion: number): void;
  saveIntegrationSync(syncAt: number): void;
}
