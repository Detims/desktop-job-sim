import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CHARACTER_ANIMATION_STATES } from "../shared/character-types.js";
import type { CharacterPackManifest } from "../shared/character-types.js";
import { CharacterPackStore } from "./character-pack-store.js";

const directories: string[] = [];
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  "base64",
);

function fixture() {
  const manifest: CharacterPackManifest = {
    animations: { idle: { fps: 6, frames: [0], loop: true } },
    canvas: {
      anchors: { feet: { x: 1, y: 1 } },
      height: 1,
      hitbox: { height: 1, width: 1, x: 0, y: 0 },
      pivot: { x: 1, y: 1 },
      width: 1,
    },
    engineVersion: 1,
    fallbacks: Object.fromEntries(
      CHARACTER_ANIMATION_STATES.map((state) => [state, "idle"]),
    ) as CharacterPackManifest["fallbacks"],
    id: "sample:blue-cat",
    metadata: {
      commercialUse: "allowed",
      creator: "Artist",
      license: "MIT",
      name: "Blue Cat",
      source: "Test fixture",
      thirdPartyAssets: [],
    },
    schemaVersion: 1,
    spritesheet: {
      frameCount: 1,
      frameHeight: 1,
      frameWidth: 1,
      path: "sprites/idle.png",
      scaleMode: "nearest",
    },
    version: "1.0.0",
  };
  return {
    archiveSha256: "a".repeat(64),
    manifest,
    previewDataUrl: "data:image/png;base64,",
    spritesheet: PNG_1X1,
    warnings: [],
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    fs.rm(directory, { force: true, recursive: true })
  ));
});

describe("CharacterPackStore", () => {
  it("publishes a normalized pack and resolves a file URL", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "character-store-"));
    directories.push(root);
    const store = new CharacterPackStore(root);
    const pack = fixture();
    await store.initialize();

    await store.publish(pack);
    const visual = await store.loadVisual({
      archiveSha256: pack.archiveSha256,
      installedAt: 10,
      manifest: pack.manifest,
    });

    expect(visual.assetUrl).toMatch(/^file:\/\//);
    expect(visual.animations.work.frames).toEqual([0]);
  });

  it("does not overwrite an existing version and removes only that version", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "character-store-"));
    directories.push(root);
    const store = new CharacterPackStore(root);
    const pack = fixture();
    await store.initialize();
    await store.publish(pack);

    await expect(store.publish(pack)).rejects.toMatchObject({
      code: "character.install_path_exists",
    });
    await store.removeVersion(pack.manifest.id, pack.manifest.version);
    await expect(store.loadVisual({
      archiveSha256: pack.archiveSha256,
      installedAt: 10,
      manifest: pack.manifest,
    })).rejects.toMatchObject({ code: "ENOENT" });
  });
});
