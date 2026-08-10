import { randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveCharacterAnimations } from "../domain/character-animation.js";
import type {
  CharacterPackManifest,
  CharacterVisual,
  InstalledCharacterPackRecord,
} from "../shared/character-types.js";
import {
  CharacterPackValidationError,
  pngDimensions,
  type ValidatedCharacterPack,
} from "./character-pack-validator.js";

function packDirectoryName(packId: string): string {
  return Buffer.from(packId, "utf8").toString("base64url");
}

export class CharacterPackStore {
  private readonly packsRoot: string;
  private readonly stagingRoot: string;

  constructor(private readonly root: string) {
    this.packsRoot = join(root, "packs");
    this.stagingRoot = join(root, ".staging");
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.packsRoot, { recursive: true });
    await fs.rm(this.stagingRoot, { force: true, recursive: true });
    await fs.mkdir(this.stagingRoot, { recursive: true });
  }

  async publish(pack: ValidatedCharacterPack): Promise<void> {
    const finalDirectory = this.versionDirectory(
      pack.manifest.id,
      pack.manifest.version,
    );
    try {
      await fs.access(finalDirectory, constants.F_OK);
      throw new CharacterPackValidationError(
        "character.install_path_exists",
        "This character-pack version already exists on disk.",
      );
    } catch (error: unknown) {
      if (
        error instanceof CharacterPackValidationError ||
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }

    const stagingDirectory = join(this.stagingRoot, randomUUID());
    try {
      await fs.mkdir(
        dirname(join(stagingDirectory, pack.manifest.spritesheet.path)),
        { recursive: true },
      );
      await Promise.all([
        fs.writeFile(
          join(stagingDirectory, "character-pack.json"),
          `${JSON.stringify(pack.manifest, null, 2)}\n`,
          { flag: "wx" },
        ),
        fs.writeFile(
          join(stagingDirectory, pack.manifest.spritesheet.path),
          pack.spritesheet,
          { flag: "wx" },
        ),
      ]);
      await fs.mkdir(dirname(finalDirectory), { recursive: true });
      await fs.rename(stagingDirectory, finalDirectory);
    } catch (error: unknown) {
      await fs.rm(stagingDirectory, { force: true, recursive: true });
      throw error;
    }
  }

  async removeVersion(packId: string, version: string): Promise<void> {
    await fs.rm(this.versionDirectory(packId, version), {
      force: true,
      recursive: true,
    });
  }

  async loadVisual(pack: InstalledCharacterPackRecord): Promise<CharacterVisual> {
    const { manifest } = pack;
    const assetPath = join(
      this.versionDirectory(manifest.id, manifest.version),
      manifest.spritesheet.path,
    );
    const image = await fs.readFile(assetPath);
    const dimensions = pngDimensions(image);
    if (
      dimensions.width % manifest.spritesheet.frameWidth !== 0 ||
      dimensions.height % manifest.spritesheet.frameHeight !== 0 ||
      (dimensions.width / manifest.spritesheet.frameWidth) *
        (dimensions.height / manifest.spritesheet.frameHeight) <
        manifest.spritesheet.frameCount
    ) {
      throw new CharacterPackValidationError(
        "character.installed_image_invalid",
        "The installed spritesheet no longer matches its manifest.",
      );
    }
    return {
      animations: resolveCharacterAnimations(manifest),
      assetUrl: pathToFileURL(assetPath).toString(),
      canvas: manifest.canvas,
      frameCount: manifest.spritesheet.frameCount,
      frameHeight: manifest.spritesheet.frameHeight,
      frameWidth: manifest.spritesheet.frameWidth,
      packId: manifest.id,
      scaleMode: manifest.spritesheet.scaleMode,
      version: manifest.version,
    };
  }

  private versionDirectory(packId: string, version: string): string {
    if (!/^[0-9A-Za-z.-]+$/.test(version)) {
      throw new Error("Unsafe character-pack version.");
    }
    return join(this.packsRoot, packDirectoryName(packId), version);
  }
}
