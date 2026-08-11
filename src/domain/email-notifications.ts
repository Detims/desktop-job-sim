import type {
  EmailPrivacyMode,
  GmailMessageDetails,
  IntegrationSettings,
} from "../shared/integration-types.js";

export function isQuietTime(settings: IntegrationSettings, date: Date): boolean {
  if (!settings.quietHoursEnabled) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  const { quietEndMinutes: end, quietStartMinutes: start } = settings;
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

function clean(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? fallback : normalized;
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;
}

export function notificationText(
  count: number,
  privacyMode: EmailPrivacyMode,
  newest: GmailMessageDetails | null,
): string {
  const noun = count === 1 ? "email" : "emails";
  if (privacyMode === "countOnly" || newest === null) {
    return `${count} new ${noun}`;
  }
  const sender = truncate(clean(newest.sender, "Unknown sender"), 80);
  const subject = truncate(clean(newest.subject, "No subject"), 100);
  const prefix = count === 1 ? "" : `${count} new emails. Latest: `;
  if (privacyMode === "senderSubject") {
    return `${prefix}${sender} — ${subject}`;
  }
  const preview = truncate(clean(newest.preview, "No preview available"), 160);
  return `${prefix}${sender} — ${subject}\n${preview}`;
}

export function gmailTarget(threadId: string | null): string {
  const fragment = threadId === null
    ? "#inbox"
    : `#all/${encodeURIComponent(threadId)}`;
  return `https://mail.google.com/mail/u/0/${fragment}`;
}

export function isSafeGmailTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "mail.google.com";
  } catch {
    return false;
  }
}
