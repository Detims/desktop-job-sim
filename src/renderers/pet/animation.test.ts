import { describe, expect, it } from "vitest";

import { resolveAnimation } from "./animation.js";

describe("resolveAnimation", () => {
  it("uses a specific animation when available", () => {
    expect(resolveAnimation("working", new Set(["working", "idle"]))).toBe(
      "working",
    );
  });

  it("falls back deterministically to idle", () => {
    expect(resolveAnimation("petted", new Set(["idle"]))).toBe("idle");
    expect(resolveAnimation("dragged", new Set(["idle"]))).toBe("idle");
  });

  it("uses the static fallback when no animation exists", () => {
    expect(resolveAnimation("walking", new Set())).toBe("static");
  });
});

