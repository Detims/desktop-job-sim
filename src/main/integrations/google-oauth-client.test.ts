import { describe, expect, it, vi } from "vitest";

import {
  buildGoogleAuthorizationUrl,
  createPkcePair,
  GoogleOAuthClient,
} from "./google-oauth-client.js";

describe("GoogleOAuthClient", () => {
  it("builds a desktop PKCE authorization request with the read-only scope", () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).not.toBe(pair.verifier);
    const url = new URL(buildGoogleAuthorizationUrl({
      challenge: pair.challenge,
      clientId: "client-id",
      redirectUri: "http://127.0.0.1:1234/oauth/callback",
      state: "state-value",
    }));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("refreshes and revokes without exposing mutation scopes", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-token",
        expires_in: 3_600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new GoogleOAuthClient("client-id", {
      fetcher,
      now: () => 1_000,
      async openExternal() {},
    });
    await expect(client.refresh("refresh-token")).resolves.toEqual({
      accessToken: "access-token",
      expiresAt: 3_601_000,
    });
    await client.revoke("refresh-token");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://oauth2.googleapis.com/token");
    expect(String(fetcher.mock.calls[1]?.[0])).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("marks invalid refresh grants as requiring reauthentication", async () => {
    const client = new GoogleOAuthClient("client-id", {
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(
        JSON.stringify({ error: "invalid_grant" }),
        { status: 400 },
      )),
      async openExternal() {},
    });
    await expect(client.refresh("expired")).rejects.toEqual(expect.objectContaining({
      code: "oauth.invalid_grant",
      reauthRequired: true,
    }));
  });

  it("distinguishes an invalid desktop OAuth client without exposing provider details", async () => {
    const client = new GoogleOAuthClient("client-id", {
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(
        JSON.stringify({ error: "unauthorized_client", error_description: "private provider detail" }),
        { status: 400 },
      )),
      async openExternal() {},
    });
    await expect(client.refresh("refresh-token")).rejects.toEqual(expect.objectContaining({
      code: "oauth.client_invalid",
      message: "Google rejected this OAuth client. Use an enabled Desktop app client ID.",
    }));
  });
});
