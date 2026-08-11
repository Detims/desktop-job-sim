import { describe, expect, it, vi } from "vitest";

import { GmailProvider } from "./gmail-provider.js";

describe("GmailProvider", () => {
  it("lists only identifiers and loads transient details separately", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [{ id: "message-1", threadId: "thread-1" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "message-1",
        internalDate: "1234",
        payload: { headers: [
          { name: "From", value: "Sender <sender@example.com>" },
          { name: "Subject", value: "A subject" },
        ] },
        snippet: "A short preview",
        threadId: "thread-1",
      }), { status: 200 }));
    const provider = new GmailProvider(fetcher);
    const references = await provider.listUnread("access", 1_000, 2_000);
    expect(references).toEqual([{
      detectedAt: 2_000,
      messageId: "message-1",
      threadId: "thread-1",
    }]);
    await expect(provider.loadDetails("access", references[0]!)).resolves.toEqual({
      detectedAt: 1_234,
      messageId: "message-1",
      preview: "A short preview",
      sender: "Sender <sender@example.com>",
      subject: "A subject",
      threadId: "thread-1",
    });
    const listUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(listUrl.searchParams.get("q")).toBe("is:unread after:1");
  });

  it("classifies unauthorized requests without retaining response content", async () => {
    const provider = new GmailProvider(
      vi.fn<typeof fetch>().mockResolvedValue(new Response("private mail", { status: 401 })),
    );
    await expect(provider.listUnread("expired", 0, 1)).rejects.toEqual(
      expect.objectContaining({
        code: "gmail.authorization_expired",
        reauthRequired: true,
      }),
    );
  });
});
