import { stat } from "node:fs/promises";

import { BUILT_IN_CHARACTER_ID, BUILT_IN_CHARACTER_SUMMARY, builtInCharacterVisual } from "../domain/built-in-character.js";
import { SequentialCommandQueue } from "../domain/command-queue.js";
import type { CharacterRegistryRepository } from "../persistence/character-registry-repository.js";
import type { CharacterPackStore } from "../persistence/character-pack-store.js";
import {
  CharacterPackValidationError,
  validateCharacterPack,
  type ValidatedCharacterPack,
} from "../persistence/character-pack-validator.js";
import { materializeEvent } from "../shared/meaningful-event.js";
import type {
  CharacterLibrarySnapshot,
  CharacterPackPreview,
  CharacterRegistryRecord,
  CharacterVisual,
  InstalledCharacterPackRecord,
} from "../shared/character-types.js";
import type { MeaningfulEvent } from "../shared/settings-activity-types.js";

interface PreviewRecord {
  archivePath: string;
  archiveSize: number;
  modifiedAt: number;
  token: string;
  validated: ValidatedCharacterPack;
}

interface CharacterControllerChange {
  library: CharacterLibrarySnapshot;
  visual: CharacterVisual;
}

type ChangeListener = (change: CharacterControllerChange) => void;
type ActivityListener = (event: MeaningfulEvent) => void;
type DiagnosticListener = (
  code: string,
  message: string,
  context?: Readonly<Record<string, boolean | number | string>>,
) => void;

function compareVersions(left: string, right: string): number {
  const parts = (version: string) => version.split("-")[0]!.split(".").map(Number);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return left.localeCompare(right);
}

export class CharacterController {
  private activeVisual: CharacterVisual = builtInCharacterVisual();
  private readonly listeners = new Set<ChangeListener>();
  private readonly previews = new Map<string, PreviewRecord>();
  private readonly queue = new SequentialCommandQueue();
  private registry: CharacterRegistryRecord;

  constructor(
    private readonly repository: CharacterRegistryRepository,
    private readonly store: CharacterPackStore,
    private readonly onActivity?: ActivityListener,
    private readonly onDiagnostic?: DiagnosticListener,
  ) {
    this.registry = repository.loadCharacterRegistry();
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
    this.registry = this.repository.loadCharacterRegistry();
    this.activeVisual = await this.resolveActiveVisual();
  }

  getLibrary(): CharacterLibrarySnapshot {
    const activeInstalled = this.registry.packs.find(
      (pack) => pack.manifest.id === this.registry.activePackId,
    );
    return {
      activeAvailable:
        this.registry.activePackId === BUILT_IN_CHARACTER_ID ||
        (activeInstalled !== undefined && this.activeVisual.packId === activeInstalled.manifest.id),
      activePackId: this.registry.activePackId,
      packs: [
        BUILT_IN_CHARACTER_SUMMARY,
        ...this.registry.packs.map((pack) => ({
          builtIn: false,
          creator: pack.manifest.metadata.creator,
          id: pack.manifest.id,
          license: pack.manifest.metadata.license,
          name: pack.manifest.metadata.name,
          version: pack.manifest.version,
        })),
      ],
    };
  }

  getActiveVisual(): CharacterVisual {
    return structuredClone(this.activeVisual);
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  preview(archivePath: string): Promise<CharacterPackPreview> {
    return this.queue.enqueue(async () => {
      const validated = await validateCharacterPack(archivePath);
      this.assertInstallVersion(validated);
      const archive = await stat(archivePath);
      const token = crypto.randomUUID();
      this.previews.clear();
      this.previews.set(token, {
        archivePath,
        archiveSize: archive.size,
        modifiedAt: archive.mtimeMs,
        token,
        validated,
      });
      return {
        manifest: structuredClone(validated.manifest),
        previewDataUrl: validated.previewDataUrl,
        token,
        warnings: [...validated.warnings],
      };
    });
  }

  install(previewToken: string, now: number): Promise<CharacterLibrarySnapshot> {
    return this.queue.enqueue(async () => {
      const preview = this.previews.get(previewToken);
      if (preview === undefined) {
        throw new CharacterPackValidationError(
          "character.preview_expired",
          "Validate the character pack again before installing it.",
        );
      }
      const archive = await stat(preview.archivePath);
      if (archive.size !== preview.archiveSize || archive.mtimeMs !== preview.modifiedAt) {
        throw new CharacterPackValidationError(
          "character.archive_changed",
          "The ZIP changed after validation. Validate it again before installing.",
        );
      }
      const validated = await validateCharacterPack(preview.archivePath);
      if (validated.archiveSha256 !== preview.validated.archiveSha256) {
        throw new CharacterPackValidationError(
          "character.archive_changed",
          "The ZIP changed after validation. Validate it again before installing.",
        );
      }
      const previous = this.assertInstallVersion(validated);
      await this.store.publish(validated);
      const installed: InstalledCharacterPackRecord = {
        archiveSha256: validated.archiveSha256,
        installedAt: now,
        manifest: validated.manifest,
      };
      const event = materializeEvent({
        details: {
          packId: validated.manifest.id,
          version: validated.manifest.version,
        },
        summary: `${validated.manifest.metadata.name} ${previous === undefined ? "installed" : "upgraded"}.`,
        type: "character.installed",
      }, now);
      try {
        this.repository.saveInstalledCharacter(installed, event);
      } catch (error: unknown) {
        await this.store.removeVersion(
          validated.manifest.id,
          validated.manifest.version,
        );
        throw error;
      }
      this.registry = {
        ...this.registry,
        packs: [
          ...this.registry.packs.filter(
            (pack) => pack.manifest.id !== validated.manifest.id,
          ),
          installed,
        ],
      };
      this.previews.delete(previewToken);
      if (previous !== undefined) {
        try {
          await this.store.removeVersion(previous.manifest.id, previous.manifest.version);
        } catch (error: unknown) {
          this.onDiagnostic?.(
            "character.upgrade_cleanup_failed",
            "An obsolete character-pack version could not be removed.",
            { packId: previous.manifest.id, version: previous.manifest.version },
          );
        }
      }
      if (this.registry.activePackId === installed.manifest.id) {
        this.activeVisual = await this.resolveActiveVisual();
      }
      this.onActivity?.(structuredClone(event));
      this.publish();
      return this.getLibrary();
    });
  }

  apply(packId: string, now: number): Promise<CharacterLibrarySnapshot> {
    return this.queue.enqueue(async () => {
      if (packId === this.registry.activePackId && this.getLibrary().activeAvailable) {
        return this.getLibrary();
      }
      const visual = packId === BUILT_IN_CHARACTER_ID
        ? builtInCharacterVisual()
        : await this.store.loadVisual(this.requireInstalled(packId));
      const event = materializeEvent({
        details: { from: this.registry.activePackId, to: packId },
        summary: `${this.nameFor(packId)} applied.`,
        type: "character.applied",
      }, now);
      this.repository.setActiveCharacter(packId, event);
      this.registry = { ...this.registry, activePackId: packId };
      this.activeVisual = visual;
      this.onActivity?.(structuredClone(event));
      this.publish();
      return this.getLibrary();
    });
  }

  remove(packId: string, now: number): Promise<CharacterLibrarySnapshot> {
    return this.queue.enqueue(async () => {
      if (packId === BUILT_IN_CHARACTER_ID) {
        throw new CharacterPackValidationError(
          "character.built_in_remove_blocked",
          "The built-in character cannot be removed.",
        );
      }
      if (packId === this.registry.activePackId) {
        throw new CharacterPackValidationError(
          "character.active_remove_blocked",
          "Apply another character before removing the active pack.",
        );
      }
      const installed = this.requireInstalled(packId);
      const stagedPath = await this.store.stageRemoval(
        installed.manifest.id,
        installed.manifest.version,
      );
      const event = materializeEvent({
        details: { packId, version: installed.manifest.version },
        summary: `${installed.manifest.metadata.name} removed.`,
        type: "character.removed",
      }, now);
      try {
        this.repository.removeInstalledCharacter(packId, event);
      } catch (error: unknown) {
        await this.store.restoreRemoval(
          stagedPath,
          installed.manifest.id,
          installed.manifest.version,
        );
        throw error;
      }
      await this.store.commitRemoval(stagedPath);
      this.registry = {
        ...this.registry,
        packs: this.registry.packs.filter((pack) => pack.manifest.id !== packId),
      };
      this.onActivity?.(structuredClone(event));
      this.publish();
      return this.getLibrary();
    });
  }

  private assertInstallVersion(
    validated: ValidatedCharacterPack,
  ): InstalledCharacterPackRecord | undefined {
    const previous = this.registry.packs.find(
      (pack) => pack.manifest.id === validated.manifest.id,
    );
    if (previous === undefined) return undefined;
    const comparison = compareVersions(
      validated.manifest.version,
      previous.manifest.version,
    );
    if (comparison === 0) {
      throw new CharacterPackValidationError(
        "character.version_installed",
        "This character-pack version is already installed.",
      );
    }
    if (comparison < 0) {
      throw new CharacterPackValidationError(
        "character.version_downgrade",
        "Character-pack downgrades are not supported.",
      );
    }
    return previous;
  }

  private requireInstalled(packId: string): InstalledCharacterPackRecord {
    const installed = this.registry.packs.find(
      (pack) => pack.manifest.id === packId,
    );
    if (installed === undefined) {
      throw new CharacterPackValidationError(
        "character.not_installed",
        "The selected character pack is not installed.",
      );
    }
    return installed;
  }

  private nameFor(packId: string): string {
    return packId === BUILT_IN_CHARACTER_ID
      ? BUILT_IN_CHARACTER_SUMMARY.name
      : this.requireInstalled(packId).manifest.metadata.name;
  }

  private async resolveActiveVisual(): Promise<CharacterVisual> {
    if (this.registry.activePackId === BUILT_IN_CHARACTER_ID) {
      return builtInCharacterVisual();
    }
    const active = this.registry.packs.find(
      (pack) => pack.manifest.id === this.registry.activePackId,
    );
    if (active === undefined) {
      this.onDiagnostic?.(
        "character.active_reference_missing",
        "The selected character reference is not installed; the built-in fallback is active.",
        { packId: this.registry.activePackId },
      );
      return builtInCharacterVisual();
    }
    try {
      return await this.store.loadVisual(active);
    } catch (error: unknown) {
      this.onDiagnostic?.(
        "character.active_content_invalid",
        "The selected character content is unavailable; the built-in fallback is active.",
        {
          packId: active.manifest.id,
          reason: error instanceof Error ? error.message : String(error),
        },
      );
      return builtInCharacterVisual();
    }
  }

  private publish(): void {
    const change = {
      library: this.getLibrary(),
      visual: this.getActiveVisual(),
    };
    for (const listener of this.listeners) listener(structuredClone(change));
  }
}
