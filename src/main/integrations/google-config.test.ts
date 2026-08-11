import { describe, expect, it } from "vitest";

import { parseGoogleClientId } from "./google-config.js";

describe("Google client configuration", () => {
  it("reads an exact client ID key without accepting comments or empty values", () => {
    expect(parseGoogleClientId(`# local only\nDESKTOP_PET_GOOGLE_CLIENT_ID="client.apps.googleusercontent.com"\n`))
      .toBe("client.apps.googleusercontent.com");
    expect(parseGoogleClientId("DESKTOP_PET_GOOGLE_CLIENT_ID=\n")).toBeNull();
    expect(parseGoogleClientId("OTHER=value\n")).toBeNull();
  });
});
