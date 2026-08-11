import { describe, expect, it } from "vitest";

import { DEFAULT_INTEGRATION_SETTINGS } from "../shared/integration-types.js";
import {
  gmailTarget,
  isQuietTime,
  isSafeGmailTarget,
  notificationText,
} from "./email-notifications.js";

describe("email notification policy", () => {
  it("handles daytime and overnight quiet-hour ranges", () => {
    const at = (hour: number) => new Date(2026, 0, 1, hour, 0);
    expect(isQuietTime({ ...DEFAULT_INTEGRATION_SETTINGS, quietHoursEnabled: true }, at(23))).toBe(true);
    expect(isQuietTime({ ...DEFAULT_INTEGRATION_SETTINGS, quietHoursEnabled: true }, at(12))).toBe(false);
    expect(isQuietTime({
      ...DEFAULT_INTEGRATION_SETTINGS,
      quietEndMinutes: 17 * 60,
      quietHoursEnabled: true,
      quietStartMinutes: 9 * 60,
    }, at(12))).toBe(true);
  });

  it("keeps count-only text private and bounds richer text", () => {
    const message = {
      detectedAt: 1,
      messageId: "message",
      preview: "Preview text",
      sender: "Sender",
      subject: "Subject",
      threadId: "thread",
    };
    expect(notificationText(2, "countOnly", message)).toBe("2 new emails");
    expect(notificationText(1, "senderSubject", message)).toBe("Sender — Subject");
    expect(notificationText(3, "shortPreview", message)).toContain("Preview text");
  });

  it("builds and validates only HTTPS Gmail targets", () => {
    expect(gmailTarget(null)).toBe("https://mail.google.com/mail/u/0/#inbox");
    expect(isSafeGmailTarget(gmailTarget("thread/id"))).toBe(true);
    expect(isSafeGmailTarget("https://mail.google.com.evil.test/#inbox")).toBe(false);
    expect(isSafeGmailTarget("javascript:alert(1)")).toBe(false);
  });
});
