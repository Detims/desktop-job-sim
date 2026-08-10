import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yazl from "yazl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_CHARACTER_ID } from "../domain/built-in-character.js";
import { CharacterPackManifestSchema } from "../shared/character-contracts.js";
import type { CharacterRegistryRepository } from "../persistence/character-registry-repository.js";
import { CharacterPackStore } from "../persistence/character-pack-store.js";
import type {
  CharacterRegistryRecord,
  InstalledCharacterPackRecord,
} from "../shared/character-types.js";
import { CHARACTER_ANIMATION_STATES } from "../shared/character-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";
import { CharacterController } from "./character-controller.js";

const directories: string[] = [];
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  "base64",
);

function manifest(version: string) {
  return CharacterPackManifestSchema.parse({
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
    version,
  });
}

async function packZip(version: string): Promise<string> {
  const directory = await fs.mkdtemp(join(tmpdir(), "character-controller-pack-"));
  directories.push(directory);
  const path = join(directory, `pack-${version}.zip`);
  await new Promise<void>((resolve, reject) => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest(version))), "character-pack.json");
    zip.addBuffer(PNG_1X1, "sprites/idle.png");
    zip.outputStream.pipe(createWriteStream(path)).on("close", resolve).on("error", reject);
    zip.end();
  });
  return path;
}

class Repository implements CharacterRegistryRepository {
  events: MeaningfulEvent[] = [];
  failInstall = false;
  record: CharacterRegistryRecord = {
    activePackId: BUILT_IN_CHARACTER_ID,
    packs: [],
  };

  loadCharacterRegistry(): CharacterRegistryRecord {
    return structuredClone(this.record);
  }

  removeInstalledCharacter(packId: string, event: MeaningfulEvent): void {
    this.record.packs = this.record.packs.filter((pack) => pack.manifest.id !== packId);
    this.events.push(event);
  }

  saveInstalledCharacter(pack: InstalledCharacterPackRecord, event: MeaningfulEvent): void {
    if (this.failInstall) throw new Error("database unavailable");
    this.record.packs = [
      ...this.record.packs.filter((current) => current.manifest.id !== pack.manifest.id),
      structuredClone(pack),
    ];
    this.events.push(event);
  }

  setActiveCharacter(packId: string, event: MeaningfulEvent): void {
    this.record.activePackId = packId;
    this.events.push(event);
  }
}

async function controller(repository = new Repository()) {
  const root = await fs.mkdtemp(join(tmpdir(), "character-controller-store-"));
  directories.push(root);
  const instance = new CharacterController(repository, new CharacterPackStore(root));
  await instance.initialize();
  return { instance, repository };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    fs.rm(directory, { force: true, recursive: true })
  ));
});

describe("CharacterController", () => {
  it("previews, installs, and applies without touching pet activity state", async () => {
    const { instance, repository } = await controller();
    const preview = await instance.preview(await packZip("1.0.0"));

    await instance.install(preview.token, 100);
    expect(instance.getLibrary().activePackId).toBe(BUILT_IN_CHARACTER_ID);
    await instance.apply("sample:blue-cat", 200);

    expect(instance.getLibrary()).toMatchObject({
      activeAvailable: true,
      activePackId: "sample:blue-cat",
    });
    expect(instance.getActiveVisual().assetUrl).toMatch(/^file:\/\//);
    expect(repository.events.map((event) => event.type)).toEqual([
      "character.installed",
      "character.applied",
    ]);
  });

  it("allows only higher-version upgrades and refreshes an active visual", async () => {
    const { instance } = await controller();
    const first = await instance.preview(await packZip("1.0.0"));
    await instance.install(first.token, 100);
    await instance.apply("sample:blue-cat", 110);

    await expect(instance.preview(await packZip("1.0.0"))).rejects.toMatchObject({
      code: "character.version_installed",
    });
    await expect(instance.preview(await packZip("0.9.0"))).rejects.toMatchObject({
      code: "character.version_downgrade",
    });
    const upgrade = await instance.preview(await packZip("1.1.0"));
    await instance.install(upgrade.token, 200);
    expect(instance.getActiveVisual().version).toBe("1.1.0");
  });

  it("rolls back filesystem publication when persistence fails", async () => {
    const { instance, repository } = await controller();
    repository.failInstall = true;
    const preview = await instance.preview(await packZip("1.0.0"));
    await expect(instance.install(preview.token, 100)).rejects.toThrow("database unavailable");

    repository.failInstall = false;
    await expect(instance.install(preview.token, 110)).resolves.toMatchObject({
      packs: expect.arrayContaining([expect.objectContaining({ id: "sample:blue-cat" })]),
    });
  });

  it("blocks active removal and atomically removes an inactive pack", async () => {
    const { instance } = await controller();
    const preview = await instance.preview(await packZip("1.0.0"));
    await instance.install(preview.token, 100);
    await instance.apply("sample:blue-cat", 110);
    await expect(instance.remove("sample:blue-cat", 120)).rejects.toMatchObject({
      code: "character.active_remove_blocked",
    });
    await instance.apply(BUILT_IN_CHARACTER_ID, 130);
    await instance.remove("sample:blue-cat", 140);
    expect(instance.getLibrary().packs.map((pack) => pack.id)).toEqual([
      BUILT_IN_CHARACTER_ID,
    ]);
  });

  it("retains a missing selection while rendering the built-in fallback", async () => {
    const repository = new Repository();
    repository.record.activePackId = "sample:blue-cat";
    repository.record.packs = [{
      archiveSha256: "a".repeat(64),
      installedAt: 1,
      manifest: manifest("1.0.0"),
    }];
    const diagnostic = vi.fn();
    const root = await fs.mkdtemp(join(tmpdir(), "character-controller-missing-"));
    directories.push(root);
    const instance = new CharacterController(
      repository,
      new CharacterPackStore(root),
      undefined,
      diagnostic,
    );

    await instance.initialize();

    expect(instance.getLibrary()).toMatchObject({
      activeAvailable: false,
      activePackId: "sample:blue-cat",
    });
    expect(instance.getActiveVisual().packId).toBe(BUILT_IN_CHARACTER_ID);
    expect(diagnostic).toHaveBeenCalledWith(
      "character.active_content_invalid",
      expect.any(String),
      expect.objectContaining({ packId: "sample:blue-cat" }),
    );
  });
});
