import { z } from "zod";

export type {
  EmailPrivacyMode,
  GmailMessageDetails,
  GmailMessageReference,
  GoogleAccessToken,
  GoogleCredential,
  IntegrationCommand,
  IntegrationConnectionState,
  IntegrationDurableState,
  IntegrationSettings,
  IntegrationSnapshot,
  MailNotification,
} from "./integration-types.js";

export const EmailPrivacyModeSchema = z.enum([
  "countOnly",
  "senderSubject",
  "shortPreview",
]);

const MinuteOfDaySchema = z.number().int().min(0).max(1_439);

export const IntegrationSettingsSchema = z.object({
  privacyMode: EmailPrivacyModeSchema,
  quietEndMinutes: MinuteOfDaySchema,
  quietHoursEnabled: z.boolean(),
  quietStartMinutes: MinuteOfDaySchema,
  settingsVersion: z.number().int().nonnegative(),
}).refine(
  ({ quietEndMinutes, quietStartMinutes }) => quietEndMinutes !== quietStartMinutes,
  { message: "Quiet-hours start and end times must differ." },
);

export const IntegrationCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connect") }),
  z.object({ type: z.literal("disconnect") }),
  z.object({ type: z.literal("refresh") }),
  z.object({
    baseVersion: z.number().int().nonnegative(),
    privacyMode: EmailPrivacyModeSchema,
    type: z.literal("setPrivacyMode"),
  }),
  z.object({
    baseVersion: z.number().int().nonnegative(),
    enabled: z.boolean(),
    endMinutes: MinuteOfDaySchema,
    startMinutes: MinuteOfDaySchema,
    type: z.literal("setQuietHours"),
  }).refine(({ endMinutes, startMinutes }) => endMinutes !== startMinutes, {
    message: "Quiet-hours start and end times must differ.",
  }),
]);

export const GmailMessageReferenceSchema = z.object({
  detectedAt: z.number().int().nonnegative(),
  messageId: z.string().min(1).max(256),
  threadId: z.string().min(1).max(256),
});

export const GoogleCredentialSchema = z.object({
  accountEmail: z.string().email().max(320),
  refreshToken: z.string().min(1).max(8_192),
});

export const MailNotificationIdSchema = z.string().uuid();
