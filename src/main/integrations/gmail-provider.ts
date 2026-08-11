import { z } from "zod";

import type {
  GmailMessageDetails,
  GmailMessageReference,
} from "../../shared/integration-types.js";

type Fetcher = typeof fetch;

const MessageListSchema = z.object({
  messages: z.array(z.object({
    id: z.string().min(1),
    threadId: z.string().min(1),
  })).optional(),
  nextPageToken: z.string().min(1).optional(),
});

const MessageDetailsSchema = z.object({
  id: z.string().min(1),
  internalDate: z.string().regex(/^\d+$/).optional(),
  payload: z.object({
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  }).optional(),
  snippet: z.string().optional(),
  threadId: z.string().min(1),
});

export class GmailProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reauthRequired = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GmailProviderError";
  }
}

export class GmailProvider {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async listUnread(
    accessToken: string,
    since: number,
    detectedAt: number,
  ): Promise<GmailMessageReference[]> {
    const messages: GmailMessageReference[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 5 && messages.length < 500; page += 1) {
      const query = new URLSearchParams({
        maxResults: "100",
        q: `is:unread after:${Math.floor(since / 1_000)}`,
      });
      if (pageToken !== undefined) query.set("pageToken", pageToken);
      const payload = MessageListSchema.parse(await this.request(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`,
        accessToken,
      ));
      for (const message of payload.messages ?? []) {
        messages.push({
          detectedAt: Math.max(0, detectedAt - messages.length),
          messageId: message.id,
          threadId: message.threadId,
        });
      }
      pageToken = payload.nextPageToken;
      if (pageToken === undefined) break;
    }
    return messages.slice(0, 500);
  }

  async loadDetails(
    accessToken: string,
    reference: GmailMessageReference,
  ): Promise<GmailMessageDetails> {
    const query = new URLSearchParams({ format: "full" });
    const payload = MessageDetailsSchema.parse(await this.request(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(reference.messageId)}?${query.toString()}`,
      accessToken,
    ));
    const headers = new Map(
      (payload.payload?.headers ?? []).map(({ name, value }) => [name.toLowerCase(), value]),
    );
    return {
      detectedAt: payload.internalDate === undefined
        ? reference.detectedAt
        : Number(payload.internalDate),
      messageId: payload.id,
      preview: payload.snippet ?? "",
      sender: headers.get("from") ?? "",
      subject: headers.get("subject") ?? "",
      threadId: payload.threadId,
    };
  }

  private async request(url: string, accessToken: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch (error: unknown) {
      throw new GmailProviderError(
        "gmail.network_failed",
        "Gmail is temporarily unavailable.",
        false,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new GmailProviderError(
        response.status === 401 ? "gmail.authorization_expired" : "gmail.request_failed",
        response.status === 401
          ? "Google authorization expired. Reconnect the account."
          : "Gmail synchronization failed.",
        response.status === 401,
      );
    }
    try {
      return await response.json();
    } catch (error: unknown) {
      throw new GmailProviderError(
        "gmail.response_invalid",
        "Gmail returned an invalid response.",
        false,
        { cause: error },
      );
    }
  }
}
