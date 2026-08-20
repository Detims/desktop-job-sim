import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { z } from "zod";

import type { GoogleAccessToken, GoogleCredential } from "../../shared/integration-types.js";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CALLBACK_PATH = "/oauth/callback";
const REQUEST_TIMEOUT_MS = 30_000;

type Fetcher = typeof fetch;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
});

const TokenErrorSchema = z.object({
  error: z.string().optional(),
});

const ProfileResponseSchema = z.object({ emailAddress: z.string().email() });

export class GoogleOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reauthRequired = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GoogleOAuthError";
  }
}

export interface PkcePair {
  challenge: string;
  verifier: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { challenge, verifier };
}

export function buildGoogleAuthorizationUrl(input: {
  challenge: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    access_type: "offline",
    client_id: input.clientId,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    prompt: "consent",
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    state: input.state,
  }).toString();
  return url.toString();
}

interface GoogleOAuthClientOptions {
  fetcher?: Fetcher;
  now?: () => number;
  openExternal(url: string): Promise<void>;
  timeoutMs?: number;
}

export class GoogleOAuthClient {
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(
    private readonly clientId: string,
    private readonly options: GoogleOAuthClientOptions,
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async authorize(): Promise<{ access: GoogleAccessToken; credential: GoogleCredential }> {
    const pkce = createPkcePair();
    const state = randomBytes(32).toString("base64url");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
    const callback = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new GoogleOAuthError("oauth.timeout", "Google sign-in timed out."));
      }, this.timeoutMs);
      server.on("request", (request, response) => {
        const url = new URL(request.url ?? "/", redirectUri);
        if (url.pathname !== CALLBACK_PATH) {
          response.writeHead(404).end();
          return;
        }
        response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        const returnedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (returnedState !== state) {
          clearTimeout(timeout);
          response.end("<h1>Sign-in failed</h1><p>The authorization state was invalid. Return to Desktop Pet.</p>");
          reject(new GoogleOAuthError("oauth.state_invalid", "Google returned an invalid authorization state."));
        } else if (error !== null || code === null) {
          clearTimeout(timeout);
          response.end("<h1>Sign-in cancelled</h1><p>You can return to Desktop Pet.</p>");
          reject(new GoogleOAuthError("oauth.cancelled", "Google sign-in was cancelled."));
        } else {
          clearTimeout(timeout);
          response.end("<h1>Connected</h1><p>You can close this tab and return to Desktop Pet.</p>");
          resolve(code);
        }
      });
    });
    // External-browser launch can fail before callback is awaited. Keep a
    // timeout rejection handled while the main flow awaits the same promise.
    void callback.catch(() => undefined);

    try {
      await this.options.openExternal(buildGoogleAuthorizationUrl({
        challenge: pkce.challenge,
        clientId: this.clientId,
        redirectUri,
        state,
      }));
      const code = await callback;
      const token = await this.exchange(new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: pkce.verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }));
      if (token.refresh_token === undefined) {
        throw new GoogleOAuthError(
          "oauth.refresh_token_missing",
          "Google did not provide offline access. Disconnect the app in Google Account settings and try again.",
        );
      }
      const accountEmail = await this.loadProfile(token.access_token);
      return {
        access: {
          accessToken: token.access_token,
          expiresAt: this.now() + token.expires_in * 1_000,
        },
        credential: { accountEmail, refreshToken: token.refresh_token },
      };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  async refresh(refreshToken: string): Promise<GoogleAccessToken> {
    const token = await this.exchange(new URLSearchParams({
      client_id: this.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }));
    return {
      accessToken: token.access_token,
      expiresAt: this.now() + token.expires_in * 1_000,
    };
  }

  async revoke(token: string): Promise<void> {
    const response = await this.fetcher(REVOKE_ENDPOINT, {
      body: new URLSearchParams({ token }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new GoogleOAuthError("oauth.revoke_failed", "Google access could not be revoked remotely.");
    }
  }

  private async exchange(body: URLSearchParams) {
    let response: Response;
    try {
      response = await this.fetcher(TOKEN_ENDPOINT, {
        body,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      throw new GoogleOAuthError("oauth.network_failed", "Google authentication is temporarily unavailable.", false, { cause: error });
    }
    if (!response.ok) {
      let providerError: string | undefined;
      try {
        providerError = TokenErrorSchema.parse(await response.clone().json()).error;
      } catch {}
      const reauthRequired = providerError === "invalid_grant";
      const failure = (() => {
        switch (providerError) {
          case "invalid_client":
          case "unauthorized_client":
            return {
              code: "oauth.client_invalid",
              message: "Google rejected this OAuth client. Use an enabled Desktop app client ID.",
            };
          case "redirect_uri_mismatch":
            return {
              code: "oauth.redirect_invalid",
              message: "Google rejected the loopback redirect. Use a Desktop app OAuth client.",
            };
          case "invalid_grant":
            return {
              code: "oauth.invalid_grant",
              message: "Google rejected the authorization code or PKCE verifier. Start authorization again.",
            };
          case "invalid_request":
            return {
              code: "oauth.request_invalid",
              message: "Google rejected the OAuth token request configuration.",
            };
          default:
            return {
              code: "oauth.exchange_failed",
              message: "Google authentication failed.",
            };
        }
      })();
      throw new GoogleOAuthError(
        failure.code,
        failure.message,
        reauthRequired,
      );
    }
    try {
      return TokenResponseSchema.parse(await response.json());
    } catch (error: unknown) {
      throw new GoogleOAuthError("oauth.response_invalid", "Google returned an invalid authentication response.", false, { cause: error });
    }
  }

  private async loadProfile(accessToken: string): Promise<string> {
    const response = await this.fetcher(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new GoogleOAuthError("oauth.profile_failed", "The connected Gmail profile could not be read.");
    }
    return ProfileResponseSchema.parse(await response.json()).emailAddress;
  }
}
