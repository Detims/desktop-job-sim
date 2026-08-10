import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";

import { CHARACTER_ANIMATION_STATES } from "../shared/character-types.js";
import {
  assertArchiveEntriesWithinLimits,
  CHARACTER_PACK_LIMITS,
  CharacterPackValidationError,
  validateCharacterPack,
} from "./character-pack-validator.js";

const directories: string[] = [];
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  "base64",
);

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ),
    id: "sample:blue-cat",
    metadata: {
      commercialUse: "unknown",
      creator: "Sample Artist",
      license: "LicenseRef-Proprietary",
      name: "Blue Cat",
      source: "Created for testing",
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
    ...overrides,
  };
}

async function zip(entries: Array<{ name: string; value: Buffer | string }>): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), "character-pack-"));
  directories.push(directory);
  const path = join(directory, "pack.zip");
  await new Promise<void>((resolve, reject) => {
    const archive = new yazl.ZipFile();
    for (const entry of entries) {
      archive.addBuffer(
        typeof entry.value === "string" ? Buffer.from(entry.value) : entry.value,
        entry.name,
      );
    }
    archive.outputStream.pipe(createWriteStream(path)).on("close", resolve).on("error", reject);
    archive.end();
  });
  return path;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    fs.rm(directory, { force: true, recursive: true })
  ));
});

describe("validateCharacterPack", () => {
  it("validates a bounded ZIP and returns an isolated PNG preview", async () => {
    const path = await zip([
      { name: "character-pack.json", value: JSON.stringify(manifest()) },
      { name: "sprites/idle.png", value: PNG_1X1 },
    ]);

    const result = await validateCharacterPack(path);

    expect(result.manifest.id).toBe("sample:blue-cat");
    expect(result.previewDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.warnings).toContain("Commercial-use permission is unknown.");
    expect(result.archiveSha256).toHaveLength(64);
  });

  it("rejects traversal and unsupported executable entries", async () => {
    const executable = await zip([
      { name: "character-pack.json", value: JSON.stringify(manifest()) },
      { name: "payload.js", value: "alert(1)" },
    ]);

    expect(() => assertArchiveEntriesWithinLimits([{
      compressedSize: 1,
      encrypted: false,
      fileName: "../character-pack.json",
      isDirectory: false,
      isSymlink: false,
      uncompressedSize: 2,
    }])).toThrowError(expect.objectContaining({
      code: "character.archive_unsafe_path",
    }));
    await expect(validateCharacterPack(executable)).rejects.toMatchObject({
      code: "character.archive_unsupported_file",
    });
  });

  it("rejects declared zip bombs without allocating their contents", () => {
    expect(() => assertArchiveEntriesWithinLimits([{
      compressedSize: 1,
      encrypted: false,
      fileName: "sprites/idle.png",
      isDirectory: false,
      isSymlink: false,
      uncompressedSize: CHARACTER_PACK_LIMITS.expandedBytes + 1,
    }])).toThrowError(CharacterPackValidationError);
  });

  it("rejects malformed image data and missing provenance", async () => {
    const badImage = await zip([
      { name: "character-pack.json", value: JSON.stringify(manifest()) },
      { name: "sprites/idle.png", value: "not a png" },
    ]);
    const missingCreator = manifest();
    (missingCreator.metadata as Record<string, unknown>).creator = "";
    const badManifest = await zip([
      { name: "character-pack.json", value: JSON.stringify(missingCreator) },
      { name: "sprites/idle.png", value: PNG_1X1 },
    ]);

    await expect(validateCharacterPack(badImage)).rejects.toMatchObject({
      code: "character.image_invalid",
    });
    await expect(validateCharacterPack(badManifest)).rejects.toMatchObject({
      code: "character.manifest_invalid",
    });
  });
});
